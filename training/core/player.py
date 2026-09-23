"""Conservative solved-node propagation: priors never override a proven mate.

The legacy policy can also be evaluated here, isolating search changes from
training. A pruned reply set cannot prove a loss or forced draw for its mover.
"""
import math
from dataclasses import dataclass, field

import chess
import numpy as np
import torch

from flychess import encode_board
from player import FlyPlayer, combined, forcing_moves, legal_map
from core.encoding import encode, legal_moves


@dataclass
class Node:
    board: chess.Board
    move: chess.Move | None = None
    prior: float = 1.0
    proof: int | None = None
    distance: int = 0
    value: float = 0.0
    ranked: list = field(default_factory=list)
    children: list = field(default_factory=list)
    complete: bool = False


def terminal(board):
    if board.is_checkmate():
        return -1
    # Full move history is retained on search branches. A second occurrence
    # does not become a draw; a threefold/fifty-move claim is respected.
    if board.is_stalemate() or board.is_insufficient_material() or board.can_claim_draw():
        return 0
    return None


def back_up(node):
    if node.proof is not None:
        node.value = float(node.proof)
        return
    if not node.children:
        return
    for child in node.children:
        back_up(child)
    wins = [child for child in node.children if child.proof == -1]
    if wins:
        node.proof = 1
        node.distance = 1 + min(child.distance for child in wins)
        node.value = 1.0
    elif node.complete and all(child.proof is not None for child in node.children):
        node.proof = -min(child.proof for child in node.children)
        node.distance = 1 + max(child.distance for child in node.children)
        node.value = float(node.proof)
    else:
        node.value = float(np.clip(.3 * node.value + .7 * max(-child.value for child in node.children), -.999, .999))


def root_score(child, best_prior, prior_weight):
    if child.proof == -1:
        return 2.0 - min(child.distance, 999) * .0001
    if child.proof == 1:
        return -2.0 + min(child.distance, 999) * .0001
    if child.proof == 0:
        return 0.0
    return float(np.clip(-child.value + prior_weight * math.log(max(child.prior, 1e-12) / best_prior), -.999, .999))


class Player(FlyPlayer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.v7 = getattr(self.model, 'encoding_version', None) == 7

    @torch.no_grad()
    def evaluate(self, boards):
        policies, values = [], []
        for offset in range(0, len(boards), self.batch):
            chunk = boards[offset:offset + self.batch]
            encoded = [encode(b, history_known=bool(b.move_stack)) if self.v7 else encode_board(b)[:2] for b in chunk]
            squares = torch.from_numpy(np.stack([e[0] for e in encoded])).to(self.device)
            globals_ = torch.from_numpy(np.stack([e[1] for e in encoded])).to(self.device)
            policy, _, value = self.model(squares, globals_)
            if self.v7:
                value = value.softmax(-1)
            policies.append(policy.float().cpu().numpy())
            values.append(value.float().cpu().numpy())
            self.evaluations += len(chunk)
        return np.concatenate(policies), np.concatenate(values)

    def _assess_nodes(self, nodes):
        if not nodes:
            return []
        policy, values = self.evaluate([node.board for node in nodes])
        stats = []
        for node, logits, value in zip(nodes, policy, values):
            mapping = legal_moves(node.board) if self.v7 else legal_map(node.board)
            indices = np.array(list(mapping))
            probabilities = np.exp(logits[indices] - logits[indices].max())
            probabilities /= probabilities.sum()
            order = np.argsort(-probabilities, kind='stable')
            node.ranked = [(mapping[indices[i]], float(probabilities[i])) for i in order]
            full = np.exp(logits - logits.max())
            stats.append((float(full[indices].sum() / full.sum()), int(logits.argmax()) in mapping))
            node.value = float(np.clip(value[0] - value[2] if self.v7 else combined(value), -.999, .999))
        return stats

    def choose(self, boards, widths=(3, 2), temperature=0., rng=None):
        if not boards or any(terminal(board) is not None for board in boards):
            raise ValueError('choose requires nonterminal boards')
        roots = [Node(board.copy()) for board in boards]
        stats = self._assess_nodes(roots)
        frontier = roots
        for width in widths:
            if width < 1:
                raise ValueError('search widths must be positive')
            fresh = []
            for node in frontier:
                if node.proof is not None:
                    continue
                priors = dict(node.ranked)
                selected = dict(node.ranked[:width])
                floor = .35 * node.ranked[0][1]
                for move in forcing_moves(node.board, self.forcing):
                    if move in priors:
                        selected.setdefault(move, max(priors[move], floor))
                # Check all policy-representable moves for immediate mate.
                # This is an explicit rules-based search feature, not policy accuracy.
                for move, prior in node.ranked:
                    node.board.push(move)
                    mate = node.board.is_checkmate()
                    node.board.pop()
                    if mate:
                        selected.setdefault(move, max(prior, floor))
                node.complete = set(selected) == set(node.board.legal_moves)
                for move, prior in selected.items():
                    child_board = node.board.copy()
                    child_board.push(move)
                    child = Node(child_board, move, prior, proof=terminal(child_board))
                    if child.proof is not None:
                        child.value = float(child.proof)
                    node.children.append(child)
                    fresh.append(child)
            self._assess_nodes([node for node in fresh if node.proof is None])
            frontier = fresh
        moves = []
        for root in roots:
            if not widths:
                choices = root.ranked[:4] if temperature and rng is not None else root.ranked[:1]
                scores = np.array([math.log(max(prior, 1e-12)) for _, prior in choices])
                possible = [move for move, _ in choices]
            else:
                back_up(root)
                best_prior = max(child.prior for child in root.children)
                children = root.children
                wins = [child for child in children if child.proof == -1]
                if wins:
                    distance = min(child.distance for child in wins)
                    children = [child for child in wins if child.distance == distance]
                elif any(child.proof != 1 for child in children):
                    children = [child for child in children if child.proof != 1]
                scores = np.array([root_score(child, best_prior, self.prior_weight) for child in children])
                possible = [child.move for child in children]
            if temperature > 0 and rng is not None and len(possible) > 1:
                probabilities = np.exp((scores - scores.max()) / temperature)
                index = rng.choice(len(possible), p=probabilities / probabilities.sum())
            else:
                index = int(scores.argmax())
            moves.append(possible[index])
        return moves, {'legal_mass': float(np.mean([s[0] for s in stats])), 'raw_legal': float(np.mean([s[1] for s in stats]))}
