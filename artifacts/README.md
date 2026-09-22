# Trained fly brains

Browser-ready exports of two trained versions of the fly, both trained by Arkazzae. Both run on the same
connectome (`public/data/mcns/`, MaleCNS v1.0) and have the same architecture,
so either can be dropped into the app.

| Model | Trained | Presentations | Reflex / Planner / Thinker Elo | In the app |
| --- | --- | --- | --- | --- |
| [fly-v6](fly-v6/) | 21 Sep 2026 | 15,735,040 | 1114 / 1273 / 1309 | yes (default) |
| [fly-v4](fly-v4/) | 19 Sep 2026 | 6,521,600 | 1027 / 1334 / 1342 | yes (Rookie, Scribe, Elder) |

Elo is from 96 games per level against Stockfish limited to 1320 (about ±65).
With search, the two brains are about equally strong. v6's longer training
shows on pure instinct, where it is clearly better. v6 is the default: it has
the better instinct, and it beat the later v9 experiment 16–0.

## Files in each folder

| File | What |
| --- | --- |
| `weights.bin.gz` | Trained parameters: synapse gains (8-bit), neuron biases and input layer (16-bit), readout (8-bit per row). The binary layout is documented in `src/ai/fly/weights.ts`. |
| `model.json` | Label, training step, counts and SHA-256 checksums of the weights and of the connectome they belong to |
| `parity.json` | Reference outputs of the PyTorch model on six positions, used to check the browser inference |

## Swapping the model

```bash
cp artifacts/fly-v4/weights.bin.gz artifacts/fly-v4/model.json public/data/flybrain/
cp artifacts/fly-v4/parity.json src/ai/fly/fixtures/parity.json
npx vitest run src/ai/fly/parity.test.ts   # must pass
```

Also update the level ratings in `src/ai/bots/levels.ts`.
