import unittest

from droso1.match_audit import clustered_score


class GameClusterTest(unittest.TestCase):
    def test_multiple_starts_from_one_game_remain_one_cluster(self):
        result=clustered_score([1,0,1,0,1,0],['same']*6)
        self.assertEqual(result['source_game_clusters'],1)
        self.assertEqual(result['score'],.5)
        self.assertIsNone(result['source_game_cluster_95'])

    def test_score_preserves_game_weighting_with_unequal_cluster_size(self):
        result=clustered_score([1,1,1,1,0,0],['a']*4+['b']*2)
        self.assertAlmostEqual(result['score'],2/3)
        self.assertEqual(result['source_game_cluster_95'],[0.,1.])


if __name__=='__main__':
    unittest.main()
