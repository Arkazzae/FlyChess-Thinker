"""Bounded PUCT using only the connectome for neural evaluations.

One leaf per independent game is evaluated in each GPU batch. Simulations are
bounded, including terminal visits; neural evaluations never exceed that bound.
All legal moves exist in the tree. Legacy promotion priors share the probability
of their collapsed from/to action; their child positions are evaluated separately.
Reference: https://lczero.org/dev/lc0/search/alphazero/
"""
import math
from dataclasses import dataclass

import chess
import numpy as np

from flychess import mover_move_index
from core.encoding import move_index
from core.player import Player, terminal


@dataclass
class Node:
    board: chess.Board
    move: chess.Move | None = None
    prior: float = 1.
    children: list | None = None
    visits: int = 0
    total: float = 0.
    initial: float = 0.
    proof: int | None = None
    distance: int = 0


def solve(node):
    if not node.children:
        return
    wins = [child for child in node.children if child.proof == -1]
    if wins:
        node.proof = 1
        node.distance = 1 + min(child.distance for child in wins)
    elif all(child.proof is not None for child in node.children):
        node.proof = -min(child.proof for child in node.children)
        node.distance = 1 + max(child.distance for child in node.children)


def backup(path, value):
    """Values and sums are always from the node's side-to-move perspective."""
    for node in reversed(path):
        solve(node)
        if node.proof is not None:
            value = float(node.proof)
        node.visits += 1
        node.total += value
        value = -value


class PUCTPlayer(Player):
    def __init__(self, *args, simulations=64, c_puct=1.5, **kwargs):
        super().__init__(*args, **kwargs)
        if simulations < 1 or c_puct <= 0:
            raise ValueError('positive simulation budget and exploration constant required')
        self.simulations, self.c_puct = simulations, c_puct
        self.last_root_visits = []

    def expand(self, nodes):
        policies, values = self.evaluate([node.board for node in nodes])
        stats = []
        for node, logits, value in zip(nodes, policies, values):
            moves = list(node.board.legal_moves)
            indexer = move_index if self.v7 else mover_move_index
            indices = np.array([indexer(move, node.board.turn == chess.BLACK) for move in moves])
            unique, inverse, counts = np.unique(indices, return_inverse=True, return_counts=True)
            p = np.exp(logits[unique] - logits[unique].max())
            p /= p.sum()
            priors = p[inverse] / counts[inverse]
            full = np.exp(logits - logits.max())
            stats.append((float(full[unique].sum() / full.sum()), int(logits.argmax()) in unique))
            node.initial = float(np.clip(value[0] - value[2] if self.v7 else
                                         .4 * value[0] + .35 * value[1] + .25 * value[2], -.999, .999))
            node.children = []
            for move, prior in zip(moves, priors):
                board = node.board.copy()
                board.push(move)
                # Cheap exact mate scan, including all underpromotions. Other
                # terminal rules are checked when this child is selected.
                proof = -1 if board.is_checkmate() else None
                node.children.append(Node(board, move, float(prior), proof=proof))
            solve(node)
        return stats

    def select_child(self, node):
        candidates = [child for child in node.children if child.proof != 1]
        if not candidates:
            candidates = node.children
        visited_prior = sum(child.prior for child in node.children if child.visits)
        fpu = max(-.999, node.initial - .25 * math.sqrt(visited_prior))
        scale = math.sqrt(max(1, node.visits))

        def score(child):
            q = (-float(child.proof) if child.proof is not None else
                 -child.total / child.visits if child.visits else fpu)
            return q + self.c_puct * child.prior * scale / (1 + child.visits)

        return max(candidates, key=score)

    def leaf(self, root):
        node, path = root, [root]
        while node.children is not None and node.proof is None:
            node = self.select_child(node)
            path.append(node)
        if node.proof is None:
            node.proof = terminal(node.board)
        return path

    def choose(self, boards, widths=None, temperature=0., rng=None):
        # Preserve an explicit policy-only control for capability_lab.
        if widths == ():
            return super().choose(boards, widths=(), temperature=temperature, rng=rng)
        if not boards or any(terminal(board) is not None for board in boards):
            raise ValueError('choose requires nonterminal boards')
        roots = [Node(board.copy()) for board in boards]
        stats = self.expand(roots)
        for root in roots:
            backup([root], root.initial)
        for _ in range(1, self.simulations):
            pending = []
            for root in roots:
                if root.proof is not None:
                    continue
                path = self.leaf(root)
                if path[-1].proof is not None:
                    backup(path, float(path[-1].proof))
                else:
                    pending.append(path)
            if pending:
                self.expand([path[-1] for path in pending])
                for path in pending:
                    backup(path, path[-1].initial)
            if all(root.proof is not None for root in roots):
                break
        selected = []
        self.last_root_visits = []
        for root in roots:
            children = root.children
            wins = [child for child in children if child.proof == -1]
            if wins:
                shortest = min(child.distance for child in wins)
                children = [child for child in wins if child.distance == shortest]
            elif any(child.proof != 1 for child in children):
                children = [child for child in children if child.proof != 1]
            visits = np.array([child.visits for child in children], dtype=float)
            if temperature > 0 and rng is not None and len(children) > 1:
                weights = visits if visits.sum() else np.array([child.prior for child in children])
                log_weights = np.log(np.maximum(weights, 1e-30)) / temperature
                probabilities = np.exp(log_weights - log_weights.max())
                index = int(rng.choice(len(children), p=probabilities / probabilities.sum()))
            else:
                index = max(range(len(children)), key=lambda i: (children[i].visits, children[i].prior))
            selected.append(children[index].move)
            self.last_root_visits.append({child.move.uci(): child.visits for child in root.children})
        return selected, {'legal_mass': float(np.mean([row[0] for row in stats])),
                          'raw_legal': float(np.mean([row[1] for row in stats]))}
