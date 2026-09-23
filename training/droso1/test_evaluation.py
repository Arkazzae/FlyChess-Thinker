import unittest

from droso1.teacher import paired_interval, score_regret, summarize


class RegretTest(unittest.TestCase):
    def test_chosen_move_cost_not_top_three_rank(self):
        row=score_regret({'cp':20,'mate':None},{'cp':-795,'mate':None})
        self.assertEqual(row['cp_regret'],815)
        self.assertTrue(row['severe'])

    def test_mates_are_not_fake_centipawns(self):
        row=score_regret({'cp':None,'mate':3},{'cp':40,'mate':None})
        self.assertIsNone(row['cp_regret'])
        self.assertTrue(row['teacher_mating_win_lost'])
        self.assertTrue(row['severe'])
        stats=summarize([row])
        self.assertIsNone(stats['mean_cp_regret'])
        self.assertEqual(stats['cp_comparable'],0)

    def test_already_lost_mate_not_a_new_blunder(self):
        row=score_regret({'cp':None,'mate':-4},{'cp':None,'mate':-2})
        self.assertFalse(row['severe'])

    def test_negative_search_difference_remains_visible(self):
        row=score_regret({'cp':20,'mate':None},{'cp':60,'mate':None})
        self.assertEqual(row['cp_regret'],0)
        self.assertEqual(row['raw_cp_difference'],-40)
        self.assertTrue(row['negative_cp_difference'])

    def test_bootstrap_uses_clustered_pairs(self):
        a=[{'severe':True}]*4;b=[{'severe':False}]*2+[{'severe':True}]*2
        result=paired_interval(a,b,['g1','g1','g2','g2'])
        self.assertEqual(result['clusters'],2)
        self.assertEqual(result['b_minus_a_severe_rate'],-.5)
        self.assertEqual(result['cluster_bootstrap_95'],[-1.,0.])

    def test_constant_observations_do_not_claim_zero_uncertainty(self):
        result=paired_interval([{'severe':True}]*4,[{'severe':False}]*4,['a','a','b','b'])
        self.assertEqual(result['b_minus_a_severe_rate'],-1.)
        self.assertIsNone(result['cluster_bootstrap_95'])

    def test_one_cluster_cannot_produce_a_confidence_interval(self):
        result=paired_interval([{'severe':True}],[{'severe':False}],['one_shard'])
        self.assertIsNone(result['cluster_bootstrap_95'])


if __name__=='__main__':
    unittest.main()
