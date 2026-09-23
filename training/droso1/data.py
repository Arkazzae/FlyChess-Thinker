"""Lossless packed board bits, explicit supervision masks and disk-backed batches."""
import hashlib
import json
from pathlib import Path

import chess
import numpy as np
import torch

from flychess import PIECE_VALUES, material_of
from core.encoding import MOVE_SPACE, encode, move_index

NONE = 65535
SOURCES = ('lichess', 'dagger', 'generated')
SOURCE_PROBABILITIES = np.array([.6049, .3239, .0711], np.float64)
SOURCE_PROBABILITIES /= SOURCE_PROBABILITIES.sum()
PACKED = np.dtype([
    ('fen', 'S92'), ('key', 'V16'), ('group', 'V16'), ('source', 'u1'),
    ('shard', '<u2'), ('row', '<u4'), ('squares', 'u1', (120,)),
    ('globals', '<f4', (22,)), ('legal', 'u1', (521,)),
    ('alt', '<u2', (3,)), ('altcp', '<i2', (3,)), ('reply', '<i2'),
    ('cp', '<i2', (2,)), ('outcome', 'i1'), ('value_mask', 'u1', (3,)),
    ('left', '<u2'), ('weight', '<f4'), ('blunder', '<i2'), ('pain', '<f4'),
    ('wdl', '<f4', (3,)), ('wdl_mask', 'u1'), ('wdl_source', 'u1'),
])


def source_of(path):
    return 'lichess' if 'lichess' in Path(path).name else 'dagger' if 'dagger' in Path(path).name else 'generated'


def canonical_key(board):
    """Color/rank mirror equivalence, legal EP, no invented clock/history distinctions."""
    canonical = board if board.turn == chess.WHITE else board.mirror()
    raw = ' '.join(canonical.fen(en_passant='legal').split()[:4])
    return hashlib.sha256(raw.encode()).digest()[:16]


def group_key(path, record):
    path = Path(path)
    group = (f'game:{path.stem.rsplit("-", 1)[0]}:{int(record["game"])}'
             if source_of(path) == 'generated' else f'shard:{path.name}')
    return hashlib.sha256(group.encode()).digest()[:16]


def board_error(board):
    if not board.is_valid():
        return 'invalid_standard_position'
    for color in chess.COLORS:
        promotions = sum(max(0, len(board.pieces(piece, color)) - start)
                         for piece, start in ((chess.KNIGHT, 2), (chess.BISHOP, 2), (chess.ROOK, 2), (chess.QUEEN, 1)))
        if promotions > 8 - len(board.pieces(chess.PAWN, color)):
            return 'impossible_promotion_material'
    if not 0 <= board.halfmove_clock <= 32767 or not 1 <= board.fullmove_number <= 100000:
        return 'unsupported_counter'
    if board.halfmove_clock >= 100 or board.is_insufficient_material():
        return 'terminal_or_claimable'
    return None


def convert(record, records, index, path, shard, *, native_wdl=None):
    """One historical record, with no inference of lost promotion/history labels."""
    board = chess.Board(record['fen'].decode())
    error = board_error(board)
    if error:
        raise ValueError(error)
    moves = list(board.legal_moves)
    if not moves:
        raise ValueError('terminal_no_moves')
    by_pair = {}
    for move in moves:
        by_pair.setdefault(move.from_square * 64 + move.to_square, []).append(move)
    promotion = {0: None, 1: chess.KNIGHT, 2: chess.BISHOP, 3: chess.ROOK, 4: chess.QUEEN}.get(int(record['promo']), -1)
    best = chess.Move(int(record['best']) // 64, int(record['best']) % 64, promotion=promotion)
    if best not in moves:
        raise ValueError('illegal_best')
    source = source_of(path)
    row = np.zeros((), PACKED)
    row['fen'] = record['fen']
    row['key'] = canonical_key(board)
    row['group'] = group_key(path, record)
    row['source'] = SOURCES.index(source)
    row['shard'], row['row'] = shard, index
    # Source importers discarded halfmove clocks for Lichess. A standalone
    # record never supplies the complete repetition history.
    squares, globals_ = encode(board, halfmove_known=source != 'lichess', history_known=False)
    if source == 'lichess':
        globals_[7] = 0.
    row['squares'] = np.packbits(squares.astype(np.uint8).reshape(-1))
    row['globals'] = globals_
    mask = np.zeros(MOVE_SPACE, np.uint8)
    mask[[move_index(m, board.turn == chess.BLACK) for m in moves]] = 1
    row['legal'] = np.packbits(mask)
    alternatives = {move_index(best, board.turn == chess.BLACK): int(record['cp'])}
    for pair, cp in zip(record['alt'], record['altcp']):
        choices = by_pair.get(int(pair), [])
        if len(choices) == 1:
            alternatives.setdefault(move_index(choices[0], board.turn == chess.BLACK), int(cp))
    row['alt'] = NONE
    for j, (action, cp) in enumerate(list(alternatives.items())[:3]):
        row['alt'][j], row['altcp'][j] = action, cp
    after = board.copy(stack=False)
    after.push(best)
    reply_pair = int(record['reply'])
    replies = [m for m in after.legal_moves if m.from_square * 64 + m.to_square == reply_pair]
    row['reply'] = move_index(replies[0], after.turn == chess.BLACK) if len(replies) == 1 else -1
    row['cp'][0] = record['cp']
    row['value_mask'][0] = 1
    known = source == 'generated' and int(record['left']) > 0
    if known:
        if int(record['outcome']) not in (-1, 0, 1):
            raise ValueError('invalid_outcome')
        row['left'], row['outcome'] = record['left'], record['outcome']
        row['value_mask'][2] = 1
        # Exactly +8 real plies. A shorter game does not become a copied target.
        if int(record['left']) > 8 and index + 8 < len(records):
            future = records[index + 8]
            if (int(future['game']) == int(record['game']) and
                    int(future['ply']) == int(record['ply']) + 8 and
                    int(future['left']) == int(record['left']) - 8 and
                    future['fen'].decode().split()[1] == board.fen().split()[1]):
                row['cp'][1], row['value_mask'][1] = future['cp'], 1
    before = material_of(board, board.turn) - material_of(board, not board.turn)
    if len(replies) == 1:
        after.push(replies[0])
    balance = material_of(after, board.turn) - material_of(after, not board.turn)
    row['weight'] = 1.
    if balance < before and int(record['cp']) > -60:
        row['weight'] = 2.5
    elif not board.is_capture(best):
        for move in moves:
            if board.is_capture(move) and not board.is_en_passant(move):
                victim, attacker = board.piece_at(move.to_square), board.piece_at(move.from_square)
                if victim and attacker and PIECE_VALUES[victim.piece_type] > PIECE_VALUES[attacker.piece_type] and attacker.piece_type != chess.KING:
                    row['weight'] = 1.5
                    break
    row['blunder'] = -1
    bad = by_pair.get(int(record['game']), []) if source == 'dagger' else []
    if int(record['origin']) == 5 and int(record['ply']) >= 100 and len(bad) == 1 and bad[0] != best:
        row['blunder'] = move_index(bad[0], board.turn == chess.BLACK)
        row['pain'] = min(int(record['ply']), 600) / 300.
    if native_wdl is not None and bytes(row['key']) in native_wdl:
        row['wdl'], row['wdl_mask'], row['wdl_source'] = native_wdl[bytes(row['key'])], 1, 1
    return row[()]


def unpack(rows, device='cpu'):
    squares = np.unpackbits(rows['squares'], axis=1, count=960).reshape(-1, 64, 15)
    legal = np.unpackbits(rows['legal'], axis=1, count=MOVE_SPACE).astype(bool)
    value = np.column_stack((np.tanh(rows['cp'].astype(np.float32) / 600.), rows['outcome']))
    arrays = dict(squares=squares.astype(np.float32), globals=rows['globals'].copy(), legal=legal,
                  alt=rows['alt'].astype(np.int64), altcp=rows['altcp'].astype(np.float32),
                  reply=rows['reply'].astype(np.int64), value=value.astype(np.float32),
                  value_mask=rows['value_mask'].astype(np.float32), weight=rows['weight'].copy(),
                  left=rows['left'].astype(np.int64), blunder=rows['blunder'].astype(np.int64),
                  pain=rows['pain'].copy(), source=rows['source'].astype(np.int64))
    return {name: torch.from_numpy(array).to(device) for name, array in arrays.items()}


class Dataset:
    """Read-only memmaps; deterministic sampling is keyed by committed step."""
    def __init__(self, directory, split='train'):
        self.directory = Path(directory)
        self.manifest = json.loads((self.directory / 'manifest.json').read_text())
        self.parts = [np.load(self.directory / item['file'], mmap_mode='r') for item in self.manifest[split]]
        self.ends = np.cumsum([len(p) for p in self.parts], dtype=np.int64)
        self.starts = np.r_[0, self.ends[:-1]]
        self.size = int(self.ends[-1])
        self.source_indices = {}
        if split == 'train':
            for source in SOURCES:
                self.source_indices[source] = np.load(self.directory / f'indices-{source}.npy', mmap_mode='r')

    def rows(self, indices):
        indices = np.asarray(indices, np.int64)
        result = np.empty(len(indices), PACKED)
        slots = np.searchsorted(self.ends, indices, side='right')
        for slot in np.unique(slots):
            mask = slots == slot
            result[mask] = self.parts[slot][indices[mask] - self.starts[slot]]
        return result

    def sample(self, step, batch=256, seed=2026092301):
        rng = np.random.default_rng(np.random.SeedSequence([seed, step]))
        source_ids = rng.choice(len(SOURCES), size=batch, p=SOURCE_PROBABILITIES)
        indices = np.empty(batch, np.int64)
        for i, source in enumerate(SOURCES):
            where = source_ids == i
            pool = self.source_indices[source]
            indices[where] = pool[rng.integers(len(pool), size=int(where.sum()))]
        return indices

    def batch(self, indices, device='cpu'):
        return unpack(self.rows(indices), device)
