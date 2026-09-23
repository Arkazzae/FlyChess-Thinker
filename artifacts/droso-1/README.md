# DROSO-1

A pretrained chess model built on the FlyWire v783 connectome, trained from
scratch. This is the original v10 arm B after **26,000,128 position
presentations**, released here as DROSO-1 with unchanged learned tensors.

| Property | Value |
| --- | --- |
| Neurons / directed connections | 134,181 / 2,700,513 |
| Training steps | 101,563 |
| Square / global features | 15 / 22 |
| Policy actions | 4,168; all four promotion types |
| Default search | PUCT 64, c_puct 1.5 |
| Value used in search | tanh(current CP / 600), side to move |
| Stockfish probe | ~1500 conditional Elo; 95% interval 1410–1603 |
| Held-out match against fly-v6 | 37 wins, 10 draws, 17 losses |

The rating is specific to the benchmark conditions. See the
[results and PGNs](../../benchmarks/droso-1/README.md) for the full protocol
and the less conclusive single-move comparison.

## Run

From the repository root, with Python 3.12:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r artifacts/droso-1/requirements.txt
cd artifacts/droso-1
python -m droso1.bundle --device cpu --moves e2e4 c7c5
```

Use `--device cuda` with a compatible CUDA PyTorch installation for faster
inference. `--fen '...'` sets a position; `--moves` applies UCI moves while
preserving history. Use `--unknown-clock` when an imported position has no
reliable halfmove clock. Search defaults to 64 simulations. The command returns
JSON with the chosen move, legal-move probabilities and current-value output.

This directory is a standalone inference bundle. It includes the graph,
lossless NumPy weights, Python runtime and pinned dependency versions. It does
not require Stockfish or access to the original research workspace.

## Verify

```bash
python -m droso1.verify
```

Verification checks the manifest's SHA-256 hashes, all saved tensor shapes
through strict loading, fixed anatomy buffers and CPU FP32 outputs against
reference outputs from the original export. The reference positions cover
both colours, en passant, promotions and an unknown clock.

`verification.json` records release checks, including unchanged tensors,
reference-output parity and CUDA PUCT move parity. The weights were recompressed
losslessly from 102,910,550 to 67,587,425 bytes; only the ZIP container changed.
`manifest.json` identifies the original checkpoint and the current file hashes.

The bundle does not contain AdamW, RNG or sampler state for exact training
resume. To train a new model, use the [recipe](../../docs/droso-1/recipe.md)
and [training code](../../training/README.md).

## Browser compatibility and data

The browser uses this checkpoint through a matching FP32 export in
`public/data/droso-1/` and the FlyWire graph in `public/data/flywire/`.
Its encoder and PUCT search implement the same input/action contract.
See [browser export instructions](../../docs/development.md#updating-the-model).

The graph is derived from the FlyWire Consortium's
[release 783](https://zenodo.org/records/10676866), under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Connections below
five synapses are removed; transmitter signs, neuron grouping and the chess
sensory interface are modeling choices. [Graph provenance](graph-provenance.json)
pins the upstream files and relevant scientific citations. Its coverage
statistics describe the earlier sensory map; the runtime remaps visual
neurons to cover all 64 squares.

Code and weights use the repository MIT license; the imported runtime retains
its original [MIT notice](LICENSE). The connectome data keeps its own license.
