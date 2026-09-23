# Data and licences

Application code and model weights use the repository [MIT licence](../LICENSE).
Imported training and inference source retains its [original MIT notice](../training/LICENSE).

## FlyWire anatomy

The standalone model includes `artifacts/droso-1/graph.npz`. Its browser export
is `public/data/flywire/connectome.bin.gz`. Both use the FlyWire Consortium's
[FAFB v783 connectivity release](https://zenodo.org/records/10676866), under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The graph retains connections with at least five synapses and their incident
neurons. Transmitter signs, six neuron groups and the mapping from visual
columns to chess squares are modelling choices. The trained input map covers
all 64 squares. Root IDs retain their full 64-bit precision.

[Graph provenance](../artifacts/droso-1/graph-provenance.json) records pinned
source URLs, hashes, scientific citations and transformations. Its visual
coverage statistics describe the initial map, before DROSO-1's complete-square
remapping.

The 3D view uses `soma_x/y/z` from the pinned
[FlyWire annotations v2.1.0](https://github.com/flyconnectome/flywire_annotations/tree/v2.1.0).
These are [4 × 4 × 40 nm voxel coordinates](https://fafbseg-py.readthedocs.io/en/stable/_modules/fafbseg/flywire/annotations.html).
The exporter converts them to physical coordinates, centres and uniformly
scales them, then swaps the last two axes for the viewer. Missing somata are
hidden, not invented. The [browser manifest](../public/data/flywire/manifest.json)
records the exact source, transformation and 117,708 positioned neurons.

## Legacy MaleCNS anatomy

The fly-v6 and fly-v4 prototypes use a different connectome:
`artifacts/legacy/mcns/connectome.bin.gz`, derived from
[MaleCNS v1.0](https://male-cns.janelia.org/download/) under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The [legacy manifest](../artifacts/legacy/mcns/manifest.json) records attribution
to FlyEM (HHMI Janelia), the University of Cambridge, the MRC Laboratory of
Molecular Biology and Google Research, together with source URLs and hashes.
Its traced-only, minimum-five-synapse graph has 163,903 neurons and 6,235,682
directed connections. It is retained for the legacy exports and is not loaded
by the current game.

## Training and evaluation data

Training uses Stockfish labels, recorded model mistakes and the
[Lichess evaluation database](https://database.lichess.org/#evals), released
under CC0. The historical training corpus is not bundled. Evaluation subsets,
PGNs and results are in [benchmarks/droso-1](../benchmarks/droso-1/README.md).

## Stockfish

`public/stockfish.js` is the WebAssembly build by Niklas Fiekas (multi-variant
fork), under GPL v3. It retains its licence header and runs as a separate
worker for the evaluation bar and post-game review. It does not choose the
fly's moves. This bundled [stockfish.js runtime](https://github.com/lichess-org/stockfish.js)
is separate from the native Stockfish 19 executable used by the Python data
collection and benchmark commands; configure that executable through
`STOCKFISH_EXECUTABLE`.

## Illustrations

The fly portraits live in `public/avatars/flies/`, the favicon in `public/`
and the README banner in `docs/media/`.
