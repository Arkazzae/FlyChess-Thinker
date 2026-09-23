# Data and licences

The code in this repository is under the [MIT licence](../LICENSE).

## Connectome

The game uses `public/data/flywire/connectome.bin.gz`, the **FlyWire v783**
graph DROSO-1 was trained on (see Trained weights below);
`public/data/flywire/manifest.json` records its sources and checksums.

### Legacy: MaleCNS

`artifacts/legacy/mcns/connectome.bin.gz`, used only by the legacy fly-v6/fly-v4
prototypes, is derived from **MaleCNS v1.0**, the
male *Drosophila* central nervous system connectome. It is published under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) by FlyEM (HHMI
Janelia), the University of Cambridge, the MRC Laboratory of Molecular Biology
and Google Research.

- Source: https://male-cns.janelia.org/download
- Explorer: https://codex.flywire.ai/?dataset=mcns

Changes made to the data:

- Kept only traced neurons and directed connections with at least 5 synapses.
- Assigned each neuron a sign from its predicted neurotransmitter.
- Grouped neurons into six regions.
- Normalised cell-body coordinates.
- Packed everything into a binary format.

`artifacts/legacy/mcns/manifest.json` records the exact source files and their
checksums.

## Trained weights

`artifacts/droso-1/` contains the DROSO-1 weights and its FlyWire v783 graph.
The graph comes from the FlyWire Consortium's
[connectivity release](https://zenodo.org/records/10676866), under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Its upstream files,
citations, threshold and transformations are recorded in
[graph provenance](../artifacts/droso-1/graph-provenance.json).
The model remaps visual neurons to cover all 64 chessboard squares.
The weights use the repository MIT license; imported Python source preserves
the original [MIT notice](../training/LICENSE).

Training uses generated Stockfish labels, recorded model mistakes and the
[Lichess evaluation database](https://database.lichess.org/#evals), published
under CC0. The historical training corpus is not bundled. Evaluation subsets,
PGNs and results are included in [benchmarks/droso-1](../benchmarks/droso-1/README.md).

`public/data/droso-1/` holds the browser export of DROSO-1. The legacy
fly-v6/fly-v4 weights in `artifacts/legacy/` are covered by the repository licence.

## Stockfish

`public/stockfish.js` is Stockfish compiled to WebAssembly (by Niklas Fiekas,
multi-variant fork), under the GNU GPL v3. It keeps its own licence header.
The app loads it as a separate worker for the evaluation bar and the game
review. It never plays moves.
