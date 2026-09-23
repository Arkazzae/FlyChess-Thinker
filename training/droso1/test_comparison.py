import copy
import unittest

from droso1.comparison import compare


def fixture():
    identity=dict(split='dev',positions=4,data_file_sha256='same',simulations=64,c_puct=1.5,teacher_nodes=200000,engine_sha256='same')
    rows=[dict(index=i,key=str(i),group=str(i//2),fen=str(i),cp_regret=20.,severe=False) for i in range(4)]
    return dict(identity=identity,positions=rows)


class PairedCPTest(unittest.TestCase):
    def test_common_subset_excludes_mates_on_either_side(self):
        a=fixture();b=copy.deepcopy(a)
        a['positions'][0]['cp_regret']=None
        b['positions'][1]['cp_regret']=None
        b['positions'][2]['cp_regret']=40.
        result=compare(a,b)['cp_common_subset']
        self.assertEqual(result['positions'],2)
        self.assertEqual(result['excluded_mate_or_non_cp'],2)
        self.assertEqual(result['b_minus_a_mean'],10.)
        self.assertIsNone(result['cluster_bootstrap_95'])

    def test_signed_difference_and_cluster_interval(self):
        a=fixture();b=copy.deepcopy(a)
        for i,r in enumerate(b['positions']):r['cp_regret']=30. if i<2 else 10.
        result=compare(a,b)['cp_common_subset']
        self.assertEqual(result['b_minus_a_mean'],0.)
        self.assertEqual(result['cluster_bootstrap_95'],[-10.,10.])

    def test_mismatched_position_order_rejected(self):
        a=fixture();b=copy.deepcopy(a)
        b['positions'].reverse()
        with self.assertRaises(ValueError):compare(a,b)


if __name__=='__main__':
    unittest.main()
