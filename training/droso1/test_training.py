import unittest
from types import SimpleNamespace

import chess
import numpy as np
import torch
import chess.pgn

from core.puct import Node
from droso1.loss import losses
from droso1.player import Board, Player, encode_search


def batch():
    return dict(weight=torch.tensor([1., 2.5, 1.5]), alt=torch.tensor([[12,34,65535]]*3),
                altcp=torch.tensor([[100.,50.,0.]]*3), legal=torch.ones(3,4168,dtype=torch.bool),
                reply=torch.tensor([10,-1,22]), blunder=torch.tensor([42,-1,-1]), pain=torch.tensor([2.,0.,0.]),
                value=torch.tensor([[.1,.2,1.],[.1,.3,0.],[.2,0.,-1.]]),
                value_mask=torch.tensor([[1.,1.,1.],[1.,0.,0.],[1.,0.,1.]]), left=torch.tensor([20,0,2]))


class ConstantBrain(torch.nn.Module):
    encoding_version=7
    def __init__(self, q=.25):
        super().__init__()
        self.q=q
    def forward(self, squares, globals_):
        n=len(squares)
        # Auxiliary predictions intentionally oppose current CP: they must
        # never leak into the new search value.
        return torch.zeros(n,4168),torch.zeros(n,4168),torch.tensor([[self.q,-1.,-1.]]*n)


class TrainingContractTest(unittest.TestCase):
    def test_unknown_clock_survives_search_until_a_zeroing_move(self):
        board=Board(halfmove_known=False)
        board.push_uci('g1f3')
        child=board.copy()
        self.assertFalse(child.halfmove_known)
        self.assertEqual(float(encode_search(child)[1][7]),0.)
        child.push_uci('e7e5')
        self.assertTrue(child.halfmove_known)
        child.pop()
        self.assertFalse(child.halfmove_known)
        child.pop()
        self.assertFalse(child.halfmove_known)
    def test_current_cp_coefficient_identical_between_arms(self):
        data=batch()
        grads=[]
        for arm in ('A','B'):
            p=torch.zeros(3,4168,requires_grad=True); r=p.clone()
            value=torch.zeros(3,3,requires_grad=True)
            total,terms=losses((p,r,value),data,torch.zeros(2,requires_grad=True),arm)
            grad=torch.autograd.grad(terms['current'],value)[0]
            grads.append(grad)
        torch.testing.assert_close(grads[0],grads[1],rtol=0,atol=0)
        self.assertTrue(torch.all(grads[0][:,1:]==0))

    def test_unknown_clock_root_and_pgn_roundtrip(self):
        import io
        board=Board(halfmove_known=False)
        board.push_uci('g1f3');board.push_uci('e7e5')
        self.assertTrue(board.halfmove_known)
        self.assertFalse(board.root().halfmove_known)
        game=chess.pgn.Game.from_board(board)
        restored=chess.pgn.read_game(io.StringIO(str(game)))
        self.assertFalse(restored.errors)
        self.assertEqual(restored.end().board().fen(),board.fen())

    def test_b_has_no_auxiliary_value_gradient(self):
        data=batch()
        p=torch.zeros(3,4168,requires_grad=True)
        value=torch.zeros(3,3,requires_grad=True)
        total,_=losses((p,p.clone(),value),data,torch.zeros(2,requires_grad=True),'B')
        gradient=torch.autograd.grad(total,value)[0]
        self.assertTrue(torch.all(gradient[:,1:]==0))
        self.assertTrue(torch.all(gradient[:,0]!=0))

    def test_missing_value_labels_do_not_divide_by_zero(self):
        data=batch();data['value_mask'].zero_()
        p=torch.zeros(3,4168,requires_grad=True)
        total,terms=losses((p,p.clone(),torch.zeros(3,3,requires_grad=True)),data,torch.zeros(2,requires_grad=True),'A')
        self.assertTrue(torch.isfinite(total))
        self.assertEqual(float(terms['current']+terms['future']+terms['outcome']+terms['consistency']),0.)

    def test_pain_penalizes_bad_move_with_full_batch_denominator(self):
        data=batch()
        p=torch.zeros(3,4168,requires_grad=True)
        _,terms=losses((p,p.clone(),torch.zeros(3,3,requires_grad=True)),data,torch.zeros(2,requires_grad=True),'B')
        expected=.5 * -np.log1p(-1/4168) * 2 / 3
        self.assertAlmostEqual(float(terms['pain']),expected,places=8)
        gradient=torch.autograd.grad(terms['pain'],p)[0]
        self.assertGreater(float(gradient[0,42]),0)
        self.assertEqual(float(gradient[1:].abs().sum()),0.)

    def test_search_uses_cp_without_softmax_or_auxiliary_mix(self):
        player=Player(ConstantBrain(.25),device='cpu',simulations=4)
        node=Node(chess.Board())
        player.expand([node])
        self.assertEqual(node.initial,.25)

    def test_all_promotions_and_rook_choice_in_search(self):
        board=chess.Board('8/1P6/8/8/8/8/5K2/7k w - - 0 1')
        player=Player(ConstantBrain(0.),device='cpu',simulations=64)
        root=Node(board);player.expand([root])
        self.assertEqual(len([c for c in root.children if c.move.promotion]),4)
        self.assertEqual(player.choose([board])[0][0].uci(),'b7b8r')


if __name__=='__main__':
    unittest.main()
