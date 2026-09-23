"""Shared sparse connectome dynamics and readout.

DROSO-1 supplies the fixed FlyWire v783 graph and extends the sensory and
policy interfaces in droso1.model. Each anatomical edge has a trainable
multiplicative gain; neuron biases, sensory weights and readout are learned.

  drive_i = relu(kappa * norm_i * sum_e a_src * sign_src * count_e * exp(g_e) + b_i + input_i)
  a_i    <- (1 - alpha) * a_i + alpha * drive_i / (1 + drive_i)
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from flychess import GLOBAL_FEATURES, MOVE_SPACE, SQUARE_FEATURES, square_of_column

ALPHA = 0.65
KAPPA = 0.95
STEPS = 10
HIDDEN = 512
CENTRAL_SAMPLE = 2048     # readout electrodes per sampled region
VALUE_HEADS = 3  # now, +8 plies, final outcome


@dataclass
class Graph:
    """Incoming CSR of the connectome, as exported by export_connectome.py."""
    count: int
    offsets: np.ndarray   # int64 [N+1]
    sources: np.ndarray   # int64 [M]
    counts: np.ndarray    # float32 [M] measured synapse counts
    signs: np.ndarray     # float32 [N]
    groups: np.ndarray    # uint8 [N]
    hex1: np.ndarray
    hex2: np.ndarray
    ids: np.ndarray

    @property
    def edges(self) -> int:
        return len(self.sources)

    @classmethod
    def load(cls, path: str) -> 'Graph':
        data = np.load(path, allow_pickle=True)
        return cls(count=len(data['groups']), offsets=data['offsets'].astype(np.int64), sources=data['sources'].astype(np.int64),
                   counts=data['weights'].astype(np.float32), signs=data['signs'].astype(np.float32), groups=data['groups'],
                   hex1=data['hex1'], hex2=data['hex2'], ids=data['ids'])

    def targets(self) -> np.ndarray:
        return np.repeat(np.arange(self.count, dtype=np.int64), np.diff(self.offsets))


class SparseMatmul(torch.autograd.Function):
    """y = W @ x for a CSR matrix with trainable values. Backward uses the
    transposed CSR (precomputed permutation) for the input gradient and a chunked
    half-precision batched dot product for the 6.2 M edge gradients.

    edge_samples > 0 estimates the edge gradient from that many random positions of
    the batch (rescaled, unbiased). The edge gradient dominates the step time and is
    averaged over the batch anyway, so a sub-sample trades a little noise for speed."""
    edge_samples = 0

    @staticmethod
    def multiply(matrix, x):
        if x.is_cuda and torch.version.hip:
            # rocSPARSE expects column-major dense matrices. Let recurrent states
            # retain that layout instead of copying both ways at every step.
            x = x.t().contiguous().t()
            out = torch.empty_strided(x.shape, (1, x.shape[0]), device=x.device, dtype=x.dtype)
            return torch.addmm(out, matrix, x, beta=0, out=out)
        return torch.sparse.mm(matrix, x)

    @staticmethod
    def forward(ctx, values, x, crow, col, crow_t, col_t, perm_t, n):
        ctx.save_for_backward(values, x, crow, col, crow_t, col_t, perm_t)
        ctx.n = n
        w = torch.sparse_csr_tensor(crow, col, values, size=(n, n))
        return SparseMatmul.multiply(w, x)

    @staticmethod
    def backward(ctx, grad_y):
        values, x, crow, col, crow_t, col_t, perm_t = ctx.saved_tensors
        n = ctx.n
        rocm = grad_y.is_cuda and torch.version.hip is not None
        grad_y = grad_y.t().contiguous().t() if rocm else grad_y.contiguous()
        wt = torch.sparse_csr_tensor(crow_t, col_t, values[perm_t], size=(n, n))
        grad_x = SparseMatmul.multiply(wt, grad_y)
        # grad of edge (i <- j) = <grad_y[i], x[j]>. cuSPARSE SDDMM is ~7x slower than a chunked
        # half-precision batched dot product on this graph, so gather explicitly.
        row = torch.repeat_interleave(torch.arange(n, device=values.device), (crow[1:] - crow[:-1]).long())
        col_long = col.long()
        if grad_y.is_cuda:
            gy, xx = grad_y, x
            samples = SparseMatmul.edge_samples
            scale = 1.0
            if 0 < samples < grad_y.shape[1]:
                pick = torch.randperm(grad_y.shape[1], device=grad_y.device)[:samples]
                gy, xx, scale = grad_y[:, pick], x[:, pick], grad_y.shape[1] / samples
            gy, xx = gy.half(), xx.half()
            grad_values = torch.empty(len(values), device=values.device, dtype=torch.half)
            step = 500_000
            for s in range(0, len(values), step):
                if rocm:
                    # Millions of tiny batched GEMMs are slow on RDNA4. Keep the
                    # same half operands/output and accumulate products in FP32.
                    left, right = gy[row[s:s + step]], xx[col_long[s:s + step]]
                    grad_values[s:s + step] = (left.float() * right.float()).sum(dim=1)
                else:
                    grad_values[s:s + step] = torch.bmm(gy[row[s:s + step]].unsqueeze(1), xx[col_long[s:s + step]].unsqueeze(2)).view(-1)
            grad_values = grad_values.float() * scale
        else:
            grad_values = (grad_y[row] * x[col_long]).sum(dim=1)
        return grad_values, grad_x, None, None, None, None, None, None


class FlyChessBrain(nn.Module):
    def __init__(self, graph: Graph, steps: int = STEPS, hidden: int = HIDDEN, central_sample: int = CENTRAL_SAMPLE, seed: int = 20260918):
        super().__init__()
        self.steps = steps
        n, m = graph.count, graph.edges
        self.count, self.edges = n, m
        rng = np.random.default_rng(seed)

        # --- fixed anatomy ---
        counts = torch.from_numpy(graph.counts)
        signs = torch.from_numpy(graph.signs)
        sources = torch.from_numpy(graph.sources)
        targets = torch.from_numpy(graph.targets())
        incoming = torch.zeros(n).index_add_(0, targets, counts)
        norm = torch.where(incoming > 0, 1.0 / incoming.clamp(min=1e-6), torch.zeros(n))
        self.register_buffer('base', counts * signs[sources])          # sign_src * count_e, per edge (CSR order)
        self.register_buffer('norm', norm * KAPPA)
        self.register_buffer('crow', torch.from_numpy(graph.offsets).to(torch.int32))
        self.register_buffer('col', sources.to(torch.int32))
        # transposed CSR (outgoing) for the backward pass
        order = np.lexsort((graph.targets(), graph.sources))
        crow_t = np.zeros(n + 1, dtype=np.int64)
        crow_t[1:] = np.cumsum(np.bincount(graph.sources, minlength=n))
        self.register_buffer('crow_t', torch.from_numpy(crow_t).to(torch.int32))
        self.register_buffer('col_t', torch.from_numpy(graph.targets()[order]).to(torch.int32))
        self.register_buffer('perm_t', torch.from_numpy(order.astype(np.int64)))

        # --- trainable anatomy modulation ---
        self.gain = nn.Parameter(torch.zeros(m))       # log gain per connection
        self.bias = nn.Parameter(torch.zeros(n))

        # --- sensory interface ---
        vis = np.flatnonzero(graph.hex1 >= 0)
        squares = np.array([square_of_column(int(graph.hex1[i]), int(graph.hex2[i])) for i in vis], dtype=np.int64)
        self.register_buffer('vis_index', torch.from_numpy(vis.astype(np.int64)))
        self.register_buffer('vis_square', torch.from_numpy(squares))
        init = np.zeros((len(vis), SQUARE_FEATURES), dtype=np.float32)
        # Each measured cell type starts tuned to one board feature; every neuron then trains freely.
        init[np.arange(len(vis)), (graph.ids[vis].astype(np.int64) * 2654435761 >> 7) % SQUARE_FEATURES] = 1.0
        self.vis_weight = nn.Parameter(torch.from_numpy(init + rng.normal(0, 0.05, init.shape).astype(np.float32)))
        glob = np.flatnonzero(graph.groups == 5)
        self.register_buffer('glob_index', torch.from_numpy(glob.astype(np.int64)))
        ginit = np.zeros((len(glob), GLOBAL_FEATURES), dtype=np.float32)
        ginit[np.arange(len(glob)), (graph.ids[glob].astype(np.int64) * 2654435761 >> 7) % GLOBAL_FEATURES] = 1.0
        self.glob_weight = nn.Parameter(torch.from_numpy(ginit + rng.normal(0, 0.05, ginit.shape).astype(np.float32)))

        # --- readout population: all descending/motor neurons + fixed samples of three other regions ---
        motor = np.flatnonzero(graph.groups == 3)
        pools = [np.flatnonzero(graph.groups == 2),                          # central brain
                 np.flatnonzero(graph.groups == 1),                          # visual projection neurons
                 np.flatnonzero((graph.groups == 0) & (graph.hex1 < 0))]     # deep optic lobe (no direct board input)
        samples = [np.sort(rng.choice(pool, size=min(central_sample, len(pool)), replace=False)) for pool in pools]
        readout = np.concatenate([motor, *samples]).astype(np.int64)
        self.register_buffer('readout_index', torch.from_numpy(readout))
        # Activities are small and badly scaled (mean ~0.01); standardise each electrode.
        self.feature_norm = nn.BatchNorm1d(len(readout), momentum=0.02, eps=1e-5)
        self.hidden = nn.Linear(len(readout), hidden)
        self.hidden2 = nn.Linear(hidden, hidden)
        self.policy = nn.Linear(hidden, MOVE_SPACE)
        self.reply = nn.Linear(hidden, MOVE_SPACE)
        self.value = nn.Linear(hidden, VALUE_HEADS)
        nn.init.zeros_(self.policy.bias)
        nn.init.zeros_(self.reply.bias)

    # ------------------------------------------------------------------
    def edge_values(self) -> torch.Tensor:
        return self.base * torch.exp(self.gain)

    def stimulus(self, squares: torch.Tensor, globals_: torch.Tensor) -> torch.Tensor:
        """squares [B, 64, 14], globals [B, 9] -> external input per neuron [N, B]."""
        b = squares.shape[0]
        if squares.is_cuda and torch.version.hip:
            inp = squares.new_zeros(b, self.count).t()
        else:
            inp = squares.new_zeros(self.count, b)
        vis = (squares[:, self.vis_square, :] * self.vis_weight.unsqueeze(0)).sum(-1)   # [B, nVis]
        inp.index_copy_(0, self.vis_index, vis.t())
        glob = globals_ @ self.glob_weight.t()                                            # [B, nGlob]
        inp.index_copy_(0, self.glob_index, glob.t())
        return inp

    def propagate(self, inp: torch.Tensor, steps: int | None = None, record: bool = False):
        """Run the recurrent connectome from rest. Returns final activity [N, B] (and all steps if record)."""
        values = self.edge_values()
        a = torch.zeros_like(inp)
        history = []
        for _ in range(steps or self.steps):
            s = SparseMatmul.apply(values, a, self.crow, self.col, self.crow_t, self.col_t, self.perm_t, self.count)
            drive = F.relu(s * self.norm.unsqueeze(1) + self.bias.unsqueeze(1) + inp)
            a = (1 - ALPHA) * a + ALPHA * drive / (1 + drive)
            if record:
                history.append(a)
        return (a, history) if record else a

    def heads(self, activity: torch.Tensor):
        feats = self.feature_norm(activity[self.readout_index].t())    # [B, P]
        h = self.hidden(feats)
        h = h * torch.sigmoid(1.702 * h)                                # quick GELU, mirrored in TypeScript
        r = self.hidden2(h)
        h = h + r * torch.sigmoid(1.702 * r)                            # residual second layer
        return self.policy(h), self.reply(h), torch.tanh(self.value(h))

    def forward(self, squares: torch.Tensor, globals_: torch.Tensor):
        inp = self.stimulus(squares, globals_)
        activity = self.propagate(inp)
        return self.heads(activity)


def soft_policy_target(alt: torch.Tensor, altcp: torch.Tensor, temperature: float = 120.0) -> torch.Tensor:
    """Distribution over 4096 moves from the top-3 Stockfish lines (mover frame). alt == 65535 marks absent lines."""
    valid = alt != 65535
    logits = (altcp.float() - altcp[:, :1].float()) / temperature
    logits = logits.masked_fill(~valid, float('-inf'))
    probs = torch.softmax(logits, dim=1)
    target = torch.zeros(alt.shape[0], MOVE_SPACE, device=alt.device)
    target.scatter_add_(1, alt.clamp(max=MOVE_SPACE - 1).long(), probs * valid)
    return target
