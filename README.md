![FlyChess: play chess against the brain of a fruit fly](docs/media/banner-illustrated.png)

Your opponent is the real wiring diagram of a *Drosophila* nervous system:
163,903 neurons and 6.2 million connections, mapped neuron by neuron under an
electron microscope. We kept that wiring exactly as nature built it, taught
only the strength of its synapses to play chess, and put it in your browser.

While you play, you can watch the fly think: every move sends a wave of
activity from its eyes through its brain, and you see it happen.

<img src="docs/media/gameplay.gif" width="800" alt="A game against the Thinker fly: it weighs its candidate moves (arrows) while Stockfish's bar keeps score">

## Play

Open **[fly-chess-thinker.vercel.app](https://fly-chess-thinker.vercel.app/)**,
pick a fly and press **Play**.

The first visit downloads the fly's brain (about 31 MB), and then everything
runs in your browser. It works best on a computer with a recent Chrome, Edge or
Safari; phones work too, they just think a little slower.

## What you get

- **Six flies to play**, on two trained brains:
  - fly-v6, the newest: **Reflex** (~1110) moves on pure instinct, **Planner** (~1270)
    imagines your replies first, **Thinker** (~1310) keeps thinking deeper while it has time.
  - fly-v4, the older brain: **Rookie** (~1030), **Scribe** (~1330) and **Elder** (~1340),
    the same three ways of playing.
- **The fly's brain, live**: a 3D cloud of its real neurons lighting up
  step by step, the signal flowing between brain regions, the moves it
  is weighing, and what the board looks like through its eyes.

  <img src="docs/media/brain.gif" width="800" alt="The brain view: activity spreading through 163,903 neurons, step by step">

- **Game review**: after the game, Stockfish rates every move and gives
  both players an accuracy score. You can replay the game with the fly's
  brain activity and its thoughts at every move.

  <img src="docs/media/review.png" alt="Game review with accuracy, evaluation graph and move classes" width="640">

## How good is it?

The shipped model, **fly-v6**, was trained by Arkazzae. It plays like a club beginner. Against Stockfish capped at 1320 Elo, the
Thinker won about half its games (96 games per level, so treat the ratings
as ±65). That's a fair result for something
with a brain smaller than a poppy seed that had to learn from scratch
what a legal move is.

## Want the details?

- [How the fly plays](docs/how-it-works.md): the neuron model, how it sees
  the board, and how it decides.
- [How it was trained](docs/training.md): the data, the losses, versions
  v1–v6, measurements and limitations.
- [Development](docs/development.md): running it locally, project layout,
  tests, and swapping in a new model.
- [Data and licences](docs/data.md)
- [Trained brains](artifacts/): the exported fly-v6 and fly-v4 models, with notes.

Code: [MIT](LICENSE). Connectome: MaleCNS v1.0, CC BY 4.0. The evaluation bar
uses Stockfish (GPL-3.0).
