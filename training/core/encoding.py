"""Promotion-complete action contract and explicit missing-history inputs."""
import chess
import numpy as np

from flychess import encode_board, mover_square

VERSION = 7
MOVE_SPACE = 4168
SQUARE_FEATURES = 15
GLOBAL_FEATURES = 22
UNDERPROMOTIONS = (chess.KNIGHT, chess.BISHOP, chess.ROOK)


def move_index(move, black=False):
    source = mover_square(move.from_square, black)
    target = mover_square(move.to_square, black)
    if move.promotion in UNDERPROMOTIONS:
        direction = chess.square_file(target) - chess.square_file(source)
        if chess.square_rank(source) != 6 or chess.square_rank(target) != 7 or abs(direction) > 1:
            raise ValueError('invalid underpromotion geometry')
        return 4096 + (chess.square_file(source) * 3 + direction + 1) * 3 + UNDERPROMOTIONS.index(move.promotion)
    return source * 64 + target


def legal_moves(board):
    return {move_index(move, board.turn == chess.BLACK): move for move in board.legal_moves}


def encode(board, *, halfmove_known=True, history_known=False):
    squares, globals_, black = encode_board(board)
    ep = np.zeros((64, 1), dtype=np.float32)
    if board.has_legal_en_passant():
        ep[mover_square(board.ep_square, black)] = 1
    return (np.concatenate((squares, ep), axis=1),
            np.concatenate((globals_, np.array([halfmove_known, history_known], dtype=np.float32))))


def position_key(board):
    # Unknown move counters do not make an imported diagram a new position.
    return ' '.join(board.fen(en_passant='legal').split()[:4])
