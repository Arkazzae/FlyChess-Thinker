"""Batched move selection for the Fly brain in Python. Mirrors src/ai/fly/planner.ts:
instinct (the policy head) proposes moves, thinking decides. The brain imagines the
positions after its candidates, the opponent's likely replies, its own follow-ups and
so on (`widths` = moves examined at each half-move), evaluates every imagined position
with its own value heads and backs the values up with negamax:

    leaf      v = combined value heads, side to move
    finished  v = -1 if mated, 0 if drawn
    inner     v = STATIC_SHARE * own + (1 - STATIC_SHARE) * max(-v_child)
    root move score = -v_child + prior_weight * ln(prior / best prior)

Two habits of a thinking player are part of the tree (measured with blunder_lab.py: 8 of 24
games were drawn by repetition from won positions, and 58 % of the big mistakes were one- or
two-move tactics that instinct never proposed):

  * memory: a position that already occurred in the game counts as a draw, as chess engines
    do, so a winning side stops shuffling and a losing side goes looking for the repetition;
  * forcing moves: captures that win material on a simple count and queen promotions are
    always imagined, for both sides, even when the policy ranks them low. The judgement of
    the resulting position is still the brain's own.

All games and all nodes of one tree level are evaluated in a single GPU batch."""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import chess
import numpy as np
import torch

from collections import Counter

from flychess import PIECE_VALUES, encode_board, mover_move_index

VALUE_MIX = (0.4, 0.35, 0.25)
STATIC_SHARE = 0.3


def combined(value: np.ndarray) -> float:
    return float(VALUE_MIX[0] * value[0] + VALUE_MIX[1] * value[1] + VALUE_MIX[2] * value[2])


def legal_map(board: chess.Board) -> dict[int, chess.Move]:
    flip = board.turn == chess.BLACK
    moves: dict[int, chess.Move] = {}
    for move in board.legal_moves:
        index = mover_move_index(move, flip)
        if index not in moves or move.promotion == chess.QUEEN:
            moves[index] = move
    return moves


def terminal_value(board: chess.Board) -> float | None:
    """Value for the side to move in a finished position, None while the game goes on."""
    if board.is_checkmate():
        return -1.0
    if board.is_stalemate() or board.is_insufficient_material() or board.is_repetition(3) or board.halfmove_clock >= 100:
        return 0.0
    return None


PRIOR_FLOOR = 0.35  # a forced-in capture is never penalised more than this share of the best prior


def forcing_moves(board: chess.Board, limit: int) -> list[chess.Move]:
    """Captures that win material on a simple count (victim - attacker if the square is defended)
    and queen promotions, best first."""
    if limit <= 0:
        return []
    scored = []
    for move in board.legal_moves:
        gain = 0
        if move.promotion == chess.QUEEN:
            gain += 8
        if board.is_capture(move):
            victim = board.piece_at(move.to_square)
            attacker = board.piece_at(move.from_square)
            taken = PIECE_VALUES[victim.piece_type] if victim else 1  # en passant
            defended = board.is_attacked_by(not board.turn, move.to_square)
            gain += taken - (PIECE_VALUES[attacker.piece_type] if defended else 0)
        elif not move.promotion:
            continue
        if gain >= 2:
            scored.append((gain, move))
    scored.sort(key=lambda item: -item[0])
    return [move for _, move in scored[:limit]]


def seen_positions(board: chess.Board) -> Counter:
    """How often every position of this game has occurred, the current one included."""
    counts: Counter = Counter()
    replay = board.copy()
    while True:
        counts[replay._transposition_key()] += 1
        if not replay.move_stack:
            return counts
        replay.pop()


@dataclass
class Node:
    board: chess.Board
    level: int
    move: chess.Move | None = None
    prior: float = 1.0
    terminal: float | None = None
    static: float = 0.0
    ranked: list = field(default_factory=list)
    children: list = field(default_factory=list)
    value: float = 0.0


class FlyPlayer:
    def __init__(self, model, device='cuda', prior_weight: float = 0.25, batch: int = 192, memory: bool = True, forcing: int = 2):
        self.model, self.device, self.prior_weight, self.batch = model, device, prior_weight, batch
        self.memory, self.forcing = memory, forcing
        self.evaluations = 0

    @torch.no_grad()
    def evaluate(self, boards: list[chess.Board]):
        policies, values = [], []
        for start in range(0, len(boards), self.batch):
            chunk = boards[start:start + self.batch]
            encoded = [encode_board(b) for b in chunk]
            squares = torch.from_numpy(np.stack([e[0] for e in encoded])).to(self.device)
            globals_ = torch.from_numpy(np.stack([e[1] for e in encoded])).to(self.device)
            policy, _reply, value = self.model(squares, globals_)
            policies.append(policy.float().cpu().numpy())
            values.append(value.float().cpu().numpy())
            self.evaluations += len(chunk)
        return np.concatenate(policies), np.concatenate(values)

    @staticmethod
    def rank(policy: np.ndarray, board: chess.Board):
        moves = legal_map(board)
        indices = np.fromiter(moves.keys(), dtype=np.int64)
        logits = policy[indices]
        priors = np.exp(logits - logits.max())
        priors /= priors.sum()
        order = np.argsort(-priors)
        full = np.exp(policy - policy.max())
        return [(moves[int(indices[i])], float(priors[i])) for i in order], float(full[indices].sum() / full.sum()), int(policy.argmax()) in moves

    def _assess(self, nodes: list[Node]):
        """Fill static value and ranked moves of every unfinished node with one batched evaluation."""
        live = [n for n in nodes if n.terminal is None]
        if not live:
            return []
        policy, value = self.evaluate([n.board for n in live])
        stats = []
        for k, node in enumerate(live):
            node.ranked, legal_mass, raw_legal = self.rank(policy[k], node.board)
            node.static = combined(value[k])
            stats.append((legal_mass, raw_legal))
        return stats

    def choose(self, boards: list[chess.Board], widths: tuple[int, ...] = (3, 2), temperature: float = 0.0, rng: np.random.Generator | None = None):
        """One move per board. widths == () plays pure instinct."""
        roots = [Node(board=b, level=0) for b in boards]
        seen = [seen_positions(b) if self.memory and widths else None for b in boards]
        owner = {id(root): k for k, root in enumerate(roots)}
        root_stats = self._assess(roots)
        stats = {'legal_mass': float(np.mean([s[0] for s in root_stats])), 'raw_legal': float(np.mean([s[1] for s in root_stats]))}
        frontier = roots
        for level, width in enumerate(widths):
            fresh = []
            for node in frontier:
                if node.terminal is not None:
                    continue
                game = owner[id(node)]
                picked = node.ranked[:width]
                if self.forcing:
                    priors = dict(node.ranked)
                    floor = PRIOR_FLOOR * (node.ranked[0][1] if node.ranked else 1.0)
                    chosen = {move for move, _ in picked}
                    picked = picked + [(m, max(priors.get(m, 0.0), floor)) for m in forcing_moves(node.board, self.forcing) if m not in chosen]
                for move, prior in picked:
                    board = node.board.copy(stack=8)
                    board.push(move)
                    finished = terminal_value(board)
                    if finished is None and seen[game] is not None and seen[game][board._transposition_key()] >= 1:
                        finished = 0.0  # a position this game has already seen: a draw, as engines score it
                    child = Node(board=board, level=level + 1, move=move, prior=prior, terminal=finished)
                    owner[id(child)] = game
                    node.children.append(child)
                    fresh.append(child)
            self._assess(fresh)
            frontier = fresh

        def back_up(node: Node) -> float:
            if node.terminal is not None:
                node.value = node.terminal
            elif not node.children:
                node.value = node.static
            else:
                node.value = STATIC_SHARE * node.static + (1 - STATIC_SHARE) * max(-back_up(child) for child in node.children)
            return node.value

        moves = []
        for root in roots:
            if not root.children:  # pure instinct
                ranked = root.ranked
                if temperature > 0 and rng is not None and len(ranked) > 1:
                    top = ranked[:4]
                    weights = np.array([p for _, p in top]) ** (1 / max(temperature, 1e-3))
                    moves.append(top[rng.choice(len(top), p=weights / weights.sum())][0])
                else:
                    moves.append(ranked[0][0])
                continue
            best_prior = max(max(child.prior for child in root.children), 1e-9)
            scored = sorted(((-back_up(child) + self.prior_weight * math.log(max(child.prior, 1e-9) / best_prior), child.move) for child in root.children),
                            key=lambda item: -item[0])
            if temperature > 0 and rng is not None and len(scored) > 1:
                weights = np.exp((np.array([s for s, _ in scored]) - scored[0][0]) / temperature)
                moves.append(scored[rng.choice(len(scored), p=weights / weights.sum())][1])
            else:
                moves.append(scored[0][1])
        return moves, stats
