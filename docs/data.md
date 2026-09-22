# Data and licences

The code in this repository is under the [MIT licence](../LICENSE).

## Connectome

`public/data/mcns/connectome.bin.gz` is derived from **MaleCNS v1.0**, the
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

`public/data/mcns/manifest.json` records the exact source files and their
checksums.

## Trained weights

`public/data/flybrain/` holds the trained fly-v6 synapse gains, input layer
and readout. They are covered by the repository licence.

## Stockfish

`public/stockfish.js` is Stockfish compiled to WebAssembly (by Niklas Fiekas,
multi-variant fork), under the GNU GPL v3. It keeps its own licence header.
The app loads it as a separate worker for the evaluation bar and the game
review. It never plays moves.
