"""Statistical edge cases: no invented finite rating at all-win/all-loss boundaries."""
import math
import unittest

import numpy as np

from droso1.rating_summary import expected,fit_rating,interval
from droso1.rating_match import OPENINGS,opening_board,skill_selection_depth


class RatingContracts(unittest.TestCase):
    def test_balanced_and_single_anchor_performance(self):
        self.assertAlmostEqual(float(fit_rating(16,[32],[1500])),1500)
        self.assertAlmostEqual(float(fit_rating(24,[32],[1500])),1500+400*math.log10(3))

    def test_unequal_opponent_exposures(self):
        opponents=np.array([1320,1500]);counts=np.array([32,16])
        points=float((expected(1425,opponents)*counts).sum())
        self.assertAlmostEqual(float(fit_rating(points,counts,opponents)),1425)

    def test_no_fake_rating_for_zero_points(self):
        self.assertTrue(np.isneginf(fit_rating(0,[32,32],[1320,1500])))
        self.assertTrue(np.isposinf(fit_rating(64,[32,32],[1320,1500])))
        self.assertIsNone(interval([-np.inf]*100)['lower'])

    def test_unbounded_bootstrap_tail_is_preserved(self):
        result=interval([-np.inf]*10+list(range(90)))
        self.assertEqual(result['lower']['boundary'],'negative_infinity')
        self.assertIsNone(result['lower']['value'])
        self.assertIsNotNone(result['upper']['value'])

    def test_opening_book_and_handicap_depth(self):
        boards=[opening_board(i) for i in range(len(OPENINGS))]
        self.assertEqual(len({b.fen() for b in boards}),16)
        self.assertEqual(len({r[1] for r in OPENINGS}),13)
        self.assertEqual(skill_selection_depth(1320),1)
        self.assertEqual(skill_selection_depth(1500),2)


if __name__=='__main__':unittest.main()
