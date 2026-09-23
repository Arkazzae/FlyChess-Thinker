import unittest
from pathlib import Path

import chess
import numpy as np

from generate import RECORD, encode_move, promo_code
from core.encoding import encode, move_index
from droso1.data import PACKED, canonical_key, convert, unpack


def raw(board, move, cp=50, *, reply=None):
    row = np.zeros((), RECORD)
    row['fen'] = board.fen().encode()
    row['best'], row['promo'], row['cp'] = encode_move(move), promo_code(move), cp
    row['alt'], row['altcp'] = 65535, 0
    row['alt'][0], row['altcp'][0] = encode_move(move), cp
    row['reply'] = 65535 if reply is None else encode_move(reply)
    return row


class DataContractTest(unittest.TestCase):
    def convert_one(self, row, source='lichess'):
        records = np.array([row], dtype=RECORD)
        path = Path(f'example-{source}-00000.npz') if source != 'generated' else Path('example-w00-00000.npz')
        return convert(records[0], records, 0, path, 0)

    def test_all_promotions_both_colors_have_distinct_targets(self):
        for board in [chess.Board('8/1P6/8/8/8/8/5K2/7k w - - 0 1'),
                      chess.Board('8/1P6/8/8/8/8/5K2/7k w - - 0 1').mirror()]:
            targets = set()
            for move in board.legal_moves:
                if move.promotion:
                    row = self.convert_one(raw(board, move))
                    action = int(row['alt'][0])
                    targets.add(action)
                    self.assertEqual(action, move_index(move, board.turn == chess.BLACK))
                    self.assertTrue(np.unpackbits(row['legal'])[action])
            self.assertEqual(len(targets), 4)

    def test_reply_uses_replying_side_coordinates(self):
        board = chess.Board()
        row = self.convert_one(raw(board, chess.Move.from_uci('e2e4'), reply=chess.Move.from_uci('e7e5')))
        self.assertEqual(int(row['reply']), move_index(chess.Move.from_uci('e7e5'), True))

    def test_ambiguous_promotion_reply_is_masked(self):
        board = chess.Board('7k/8/8/8/8/8/p4K2/8 w - - 0 1')
        row = self.convert_one(raw(board, chess.Move.from_uci('f2e3'), reply=chess.Move.from_uci('a2a1q')))
        self.assertEqual(int(row['reply']), -1)

    def test_imports_do_not_fabricate_future_or_outcome(self):
        row = self.convert_one(raw(chess.Board(), chess.Move.from_uci('e2e4')))
        np.testing.assert_array_equal(row['value_mask'], [1, 0, 0])
        self.assertEqual(float(row['globals'][20]), 0.)
        self.assertEqual(float(row['globals'][21]), 0.)

    def test_real_eight_ply_target_checks_game_and_ply(self):
        board = chess.Board()
        line = 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8c5 b1c3'.split()
        records = []
        for i, uci in enumerate(line):
            record = raw(board, chess.Move.from_uci(uci), cp=50 + i)
            record['ply'], record['left'], record['game'], record['outcome'] = i, 9-i, 42, 1 if i%2==0 else -1
            records.append(record)
            board.push_uci(uci)
        records = np.array(records, dtype=RECORD)
        row = convert(records[0], records, 0, Path('run-w00-00001.npz'), 0)
        np.testing.assert_array_equal(row['value_mask'], [1, 1, 1])
        self.assertEqual(int(row['cp'][1]), 58)
        records[8]['game'] = 43
        row = convert(records[0], records, 0, Path('run-w00-00001.npz'), 0)
        np.testing.assert_array_equal(row['value_mask'], [1, 0, 1])
        last = convert(records[-1], records, 8, Path('run-w00-00001.npz'), 0)
        np.testing.assert_array_equal(last['value_mask'], [1, 0, 1])

    def test_dagger_cost_is_not_a_game_identifier(self):
        record = raw(chess.Board(), chess.Move.from_uci('e2e4'))
        record['origin'], record['ply'], record['game'] = 5, 450, encode_move(chess.Move.from_uci('f2f3'))
        row = self.convert_one(record, 'dagger')
        self.assertEqual(int(row['blunder']), move_index(chess.Move.from_uci('f2f3')))
        self.assertAlmostEqual(float(row['pain']), 1.5)
        np.testing.assert_array_equal(row['value_mask'], [1, 0, 0])

    def test_packed_features_preserve_en_passant_and_flags(self):
        board = chess.Board()
        for uci in 'e2e4 a7a6 e4e5 d7d5'.split():
            board.push_uci(uci)
        row = self.convert_one(raw(board, chess.Move.from_uci('e5d6')), 'generated')
        batch = unpack(np.array([row], dtype=PACKED))
        squares, globals_ = encode(board, halfmove_known=True, history_known=False)
        np.testing.assert_array_equal(batch['squares'][0].numpy(), squares)
        np.testing.assert_array_equal(batch['globals'][0].numpy(), globals_)
        self.assertEqual(float(squares[:, 14].sum()), 1.)

    def test_mirror_and_clock_dedup(self):
        board = chess.Board()
        board.push_uci('e2e4')
        self.assertEqual(canonical_key(board), canonical_key(board.mirror()))
        clone = board.copy()
        clone.halfmove_clock = 37
        self.assertEqual(canonical_key(board), canonical_key(clone))


if __name__ == '__main__':
    unittest.main()
