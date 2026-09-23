"""Board encoding shared by the trainer, the exporter and (by contract) the
TypeScript inference in src/ai/fly/encoding.ts. Any change here must be
mirrored there; the parity fixture test enforces it.

Perspective: positions are always encoded from the side to move. When Black
is to move the board is mirrored vertically and colours are swapped, so the
mover's pawns always advance towards rank 8. Moves are indexed as
from * 64 + to in that mirrored frame (python-chess square numbering,
a1 = 0, b1 = 1, ..., h8 = 63).
"""
from __future__ import annotations

import numpy as np
import chess

SQUARE_FEATURES = 14  # 6 mover pieces, 6 opponent pieces, attacked by mover, attacked by opponent
GLOBAL_FEATURES = 20
MOVE_SPACE = 4096
PIECE_ORDER = (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN, chess.KING)
PIECE_VALUES = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
# Sum of non-pawn material of both sides in the initial position (2 x (2*3 + 2*3 + 2*5 + 9)).
PHASE_MATERIAL = 62.0
# Material sense: how many of each piece type a side can have in the initial position.
MATERIAL_ORDER = (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
MATERIAL_SCALE = (8.0, 2.0, 2.0, 2.0, 1.0)
MATERIAL_TOTAL = 39.0


def mover_square(square: int, flip: bool) -> int:
    return square ^ 56 if flip else square


def mover_move_index(move: chess.Move, flip: bool) -> int:
    return mover_square(move.from_square, flip) * 64 + mover_square(move.to_square, flip)


def encode_move_index(index: int, flip: bool) -> int:
    """Convert an absolute from*64+to index into the mover frame (or back; the flip is an involution)."""
    frm, to = divmod(int(index), 64)
    return mover_square(frm, flip) * 64 + mover_square(to, flip)


def encode_board(board: chess.Board) -> tuple[np.ndarray, np.ndarray, bool]:
    """Return (squares[64, 14] float32, globals[9] float32, flipped)."""
    flip = board.turn == chess.BLACK
    mover, opponent = board.turn, not board.turn
    squares = np.zeros((64, SQUARE_FEATURES), dtype=np.float32)
    for square, piece in board.piece_map().items():
        base = 0 if piece.color == mover else 6
        squares[mover_square(square, flip), base + PIECE_ORDER.index(piece.piece_type)] = 1.0
    for square in chess.SQUARES:
        target = mover_square(square, flip)
        if board.is_attacked_by(mover, square):
            squares[target, 12] = 1.0
        if board.is_attacked_by(opponent, square):
            squares[target, 13] = 1.0
    material = sum(PIECE_VALUES[p.piece_type] for p in board.piece_map().values() if p.piece_type != chess.PAWN)
    globals_ = np.array([
        float(board.has_kingside_castling_rights(mover)),
        float(board.has_queenside_castling_rights(mover)),
        float(board.has_kingside_castling_rights(opponent)),
        float(board.has_queenside_castling_rights(opponent)),
        float(board.is_check()),
        float(board.ep_square is not None and any(m.to_square == board.ep_square and board.is_en_passant(m) for m in board.legal_moves)),
        min(1.0, material / PHASE_MATERIAL),
        min(1.0, board.halfmove_clock / 100.0),
        1.0,
        *material_sense(board, mover),
    ], dtype=np.float32)
    return squares, globals_, flip


def material_sense(board: chess.Board, mover: chess.Color) -> list[float]:
    """Interoception rather than vision: what each side still owns (five piece types, scaled to
    the initial counts, capped at 1.5 after promotions) and the signed balance in pawns / 39."""
    counts = {color: [len(board.pieces(piece, color)) for piece in MATERIAL_ORDER] for color in (chess.WHITE, chess.BLACK)}
    own, theirs = counts[mover], counts[not mover]
    balance = sum((o - t) * PIECE_VALUES[p] for o, t, p in zip(own, theirs, MATERIAL_ORDER))
    return ([min(1.5, o / s) for o, s in zip(own, MATERIAL_SCALE)] + [min(1.5, t / s) for t, s in zip(theirs, MATERIAL_SCALE)]
            + [max(-1.0, min(1.0, balance / MATERIAL_TOTAL))])


def legal_mask(board: chess.Board) -> np.ndarray:
    """Boolean [4096] mask in the mover frame. Promotions collapse onto their from-to pair."""
    flip = board.turn == chess.BLACK
    mask = np.zeros(MOVE_SPACE, dtype=bool)
    for move in board.legal_moves:
        mask[mover_move_index(move, flip)] = True
    return mask


def material_of(board: chess.Board, color: chess.Color) -> int:
    return sum(PIECE_VALUES[p.piece_type] for p in board.piece_map().values() if p.color == color)


def square_of_column(hex1: int, hex2: int) -> int:
    """Map a measured optic-lobe column (assignedOlHex1 1..36, assignedOlHex2 1..39) onto a board square.
    This is our artificial interface between the fly's eye and the board, not biological retinotopy."""
    file = min(7, max(0, (hex1 - 1) * 8 // 36))
    rank = min(7, max(0, (hex2 - 1) * 8 // 39))
    return rank * 8 + file
