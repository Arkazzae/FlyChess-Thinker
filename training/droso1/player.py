"""Full-promotion PUCT with a CP scalar, without modifying historical players."""
import numpy as np
import torch
import chess

from core.encoding import encode
from core.puct import PUCTPlayer


class Board(chess.Board):
    """Carry unknown clock information through PUCT copies and speculative moves."""
    def __init__(self, fen=chess.STARTING_FEN, *, halfmove_known=True, chess960=False):
        if chess960:
            raise ValueError('the model supports standard chess only')
        self.halfmove_known=halfmove_known
        self._knowledge_stack=[]
        super().__init__(fen)

    def root(self):
        board=super().root()
        board.halfmove_known=self._knowledge_stack[0] if self._knowledge_stack else self.halfmove_known
        return board

    def push(self, move):
        self._knowledge_stack.append(self.halfmove_known)
        self.halfmove_known=self.halfmove_known or self.is_zeroing(move)
        super().push(move)

    def pop(self):
        move=super().pop()
        self.halfmove_known=self._knowledge_stack.pop()
        return move

    def clear_stack(self):
        super().clear_stack()
        self._knowledge_stack=[]

    def copy(self, *, stack=True):
        board=super().copy(stack=stack)
        board.halfmove_known=self.halfmove_known
        n=len(board.move_stack)
        board._knowledge_stack=self._knowledge_stack[-n:].copy() if n else []
        return board


def encode_search(board):
    known=getattr(board,'halfmove_known',True)
    squares,globals_=encode(board,halfmove_known=known,history_known=False)
    if not known:
        globals_[7]=0.
    return squares,globals_


class Player(PUCTPlayer):
    @torch.no_grad()
    def evaluate(self, boards):
        policies, values = [], []
        for offset in range(0, len(boards), self.batch):
            part = boards[offset:offset+self.batch]
            # FEN starts provide a clock, but not complete repetition history.
            encoded = [encode_search(board) for board in part]
            squares = torch.as_tensor(np.stack([x[0] for x in encoded]), dtype=torch.float32, device=self.device)
            globals_ = torch.as_tensor(np.stack([x[1] for x in encoded]), dtype=torch.float32, device=self.device)
            policy, _, raw = self.model(squares, globals_)
            q = raw[:, 0].float().cpu().numpy()
            # The existing action-complete PUCT adapter reads v[0]-v[2]. These
            # are an internal signed-value transport, NOT predicted WDL.
            value_transport = np.column_stack((q, np.zeros_like(q), np.zeros_like(q)))
            policies.append(policy.float().cpu().numpy())
            values.append(value_transport)
            self.evaluations += len(part)
        return np.concatenate(policies), np.concatenate(values)
