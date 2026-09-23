"""Fresh full FlyWire with promotion-complete policy and tanh CP supervision."""
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

from model import ALPHA, FlyChessBrain, SparseMatmul
from core.input_map import complete_square_map
from core.encoding import MOVE_SPACE


class Brain(FlyChessBrain):
    encoding_version = 7
    value_kind = 'current_cp_tanh'

    def __init__(self, graph, *, steps=10, hidden=512, central_sample=2048, seed=2026092301):
        # No checkpoint is accepted here: every trainable tensor starts fresh.
        super().__init__(graph, steps=steps, hidden=hidden, central_sample=central_sample, seed=seed)
        visual = self.vis_index.numpy()
        self.vis_square.copy_(torch.from_numpy(complete_square_map(graph.hex1[visual], graph.hex2[visual])))
        rng = np.random.default_rng(seed)
        for name, indices, features in [('vis_weight', visual, 15), ('glob_weight', self.glob_index.numpy(), 22)]:
            init = np.zeros((len(indices), features), dtype=np.float32)
            init[np.arange(len(indices)), (graph.ids[indices].astype(np.int64) * 2654435761 >> 7) % features] = 1.
            setattr(self, name, nn.Parameter(torch.from_numpy(init + rng.normal(0, .05, init.shape).astype(np.float32))))
        self.policy, self.reply = nn.Linear(hidden, MOVE_SPACE), nn.Linear(hidden, MOVE_SPACE)
        nn.init.zeros_(self.policy.bias)
        nn.init.zeros_(self.reply.bias)

    def forward(self, squares, globals_, bptt=None):
        bptt = self.steps if bptt is None else bptt
        if not 1 <= bptt <= self.steps:
            raise ValueError('invalid BPTT length')
        inp = self.stimulus(squares, globals_)
        with torch.no_grad():
            activity = self.propagate(inp.detach(), steps=self.steps-bptt) if self.steps > bptt else torch.zeros_like(inp)
        values = self.edge_values()
        for _ in range(bptt):
            recurrent = SparseMatmul.apply(values, activity, self.crow, self.col, self.crow_t, self.col_t, self.perm_t, self.count)
            drive = F.relu(recurrent * self.norm[:, None] + self.bias[:, None] + inp)
            activity = (1 - ALPHA) * activity + ALPHA * drive / (1 + drive)
        with torch.autocast('cuda', dtype=torch.bfloat16, enabled=squares.is_cuda):
            policy, reply, value = self.heads(activity)
        return policy.float(), reply.float(), value.float()


def optimizer_for(model):
    return torch.optim.AdamW([
        dict(params=[model.gain, model.bias], lr=2e-5, weight_decay=0.),
        dict(params=[p for n, p in model.named_parameters() if n not in ('gain', 'bias')], lr=6e-5, weight_decay=1e-4),
    ], betas=(.9, .98))
