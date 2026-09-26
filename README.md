![FlyChess: play chess against the brain of a fruit fly](docs/media/banner-illustrated.png)

Your opponent is the real wiring diagram of a *Drosophila* brain:
134,181 neurons and 2.7 million connections from FlyWire, mapped neuron by
neuron under an electron microscope. We kept the measured graph fixed after filtering connections below five
synapses, trained its gains, biases, inputs and readout, and put it in your browser.

While you play, you can watch the fly think: every move sends a wave of
activity from its eyes through its brain, and you see it happen.

<img src="docs/media/gameplay.gif" width="800" alt="A game against the Thinker fly: it weighs its candidate moves (arrows) while Stockfish's bar keeps score">

## Play

Open **[fly-chess-thinker.vercel.app](https://fly-chess-thinker.vercel.app/)**,
pick a fly and press **Play**.

The first visit downloads the fly's brain (about 51 MB), and then everything
runs in your browser. It works best on a computer with a recent Chrome, Edge or
Safari; phones work too, they just think a little slower.

The gear icon opens the settings: language, sound, board options, and
whether the fly chats during the game.

## The fly's brain, live

A 3D cloud of its real neurons lighting up step by step, the signal flowing
between brain regions, the moves it is weighing, and what the board looks like
through its eyes.

<img src="docs/media/brain.gif" width="800" alt="Simulated activity in the fly's brain; the cloud shows 117,708 neurons with measured cell-body positions">

## How good is it?

All three flies share one model and differ only in how many positions they
look at before moving: Scout 8, Tactician 32, Thinker 64. The Thinker scored
about **1500** in 64 games against Stockfish 19 limited to 1320 and 1500
(95% interval 1410–1603). That is a result for [this test](benchmarks/droso-1/README.md),
not a FIDE or Lichess rating; Scout and Tactician have not been rated. The
model learned move preferences and position values from scratch; the chess
rules and the legal-move filter come from ordinary code.

## The model: DROSO-1

**DROSO-1** is the model the game runs. It was trained from scratch on the
FlyWire v783 connectome for 26 million position presentations (repeats
included) and beat the earlier prototype, fly-v6, 37–10–17 in a held-out match.

The repository includes the **[ready-to-run trained model](artifacts/droso-1/README.md)**,
the **[training recipe](docs/droso-1/recipe.md)** and the
[Python training pipeline](training/README.md), plus
[research notes](docs/droso-1/research.md) and benchmark JSON/PGN files.
Use the recipe to prepare your own data, train, evaluate and export a model.

To run the pretrained model with Python 3.12, from the repository root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r artifacts/droso-1/requirements.txt
cd artifacts/droso-1
python -m droso1.bundle --device cpu --moves e2e4 c7c5
```

Inference runs on CPU; a CUDA GPU makes it faster and is required for
training. The pretrained bundle includes weights and anatomy; the original
training corpus and optimizer state are not included. The browser game runs
the same model from `public/data/droso-1/`.

The earlier prototypes, fly-v6 and fly-v4, were trained on a different
connectome (MaleCNS v1.0) and are kept for reference in
[artifacts/legacy](artifacts/legacy/); the game no longer uses them.

## Want the details?

- [How the fly plays](docs/how-it-works.md): the neuron model, how it sees
  the board, and how it decides.
- [How it was trained](docs/training.md): an overview with links to the
  recipe, research notes and benchmarks.
- [Development](docs/development.md): running it locally, project layout,
  tests, and swapping in a new model.
- [Data and licences](docs/data.md)
- [Trained brains](artifacts/): DROSO-1, plus the legacy fly-v6/fly-v4 prototypes.

Code: [MIT](LICENSE). Connectomes: FlyWire v783 (and MaleCNS v1.0 for the legacy prototypes), CC BY 4.0. The evaluation bar
uses Stockfish (GPL-3.0).
