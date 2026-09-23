# Trained fly brains

## DROSO-1

[DROSO-1](droso-1/README.md) is the new research release: a standalone Python
model trained from scratch on FlyWire v783 for 26,000,128 presentations.
The bundle includes lossless weights, anatomy, inference code, checksums and
reference outputs. It scored approximately 1500 conditional Elo in the
[Stockfish benchmark](../benchmarks/droso-1/README.md).

Follow the [training recipe](../docs/droso-1/recipe.md) to train your own model.
DROSO-1 uses 4,168 actions. The browser game runs it from `public/data/droso-1/`.

## Legacy prototypes

> **Legacy.** fly-v6 and fly-v4 were the first prototypes. They are kept for
> reference only; the game now runs DROSO-1.

Both were trained by Arkazzae on the **MaleCNS v1.0** connectome
([`legacy/mcns/`](legacy/mcns/)), a different fly brain from DROSO-1's
FlyWire v783, and share the same architecture.

| Model | Trained | Presentations | Reflex / Planner / Thinker Elo |
| --- | --- | --- | --- |
| [fly-v6](legacy/fly-v6/) | 21 Sep 2026 | 15,735,040 | 1114 / 1273 / 1309 |
| [fly-v4](legacy/fly-v4/) | 19 Sep 2026 | 6,521,600 | 1027 / 1334 / 1342 |

Elo is from 96 games per level against Stockfish limited to 1320 (about ±65).
DROSO-1 beat fly-v6 37–10–17 in a held-out match.

| File | What |
| --- | --- |
| `weights.bin.gz` | Trained parameters: synapse gains (8-bit), neuron biases and input layer (16-bit), readout (8-bit per row) |
| `model.json` | Label, training step, counts and SHA-256 checksums of the weights and of the connectome they belong to |
| `parity.json` | Reference outputs of the PyTorch model on six positions |

The current browser engine loads DROSO-1's format and move space, so these
exports no longer drop into the app as they are.
