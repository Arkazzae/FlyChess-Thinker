import copy
import unittest

from droso1.harmonize import shared_budgets
from droso1.test_comparison import fixture


class SharedTeacherBudgetTest(unittest.TestCase):
    def test_confirmation_for_one_move_strengthens_the_whole_position(self):
        a=fixture()
        for row in a['positions']:row.update(root={'nodes':200000},chosen={'nodes':200000})
        b=copy.deepcopy(a)
        b['positions'][1].update(root={'nodes':1000000},chosen={'nodes':1000000})
        self.assertEqual(shared_budgets([a,b]),[200000,1000000,200000,200000])

    def test_unmatched_original_analysis_budget_is_rejected(self):
        a=fixture()
        for row in a['positions']:row.update(root={'nodes':200000},chosen={'nodes':1000000})
        with self.assertRaises(ValueError):shared_budgets([a])


if __name__=='__main__':
    unittest.main()
