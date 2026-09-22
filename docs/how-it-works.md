# How the fly plays

## The brain

The opponent runs on **MaleCNS v1.0**, the complete connectome of a male
fruit fly's central nervous system. We keep every directed connection with at
least 5 synapses:

| | |
| --- | --- |
| Neurons | 163,903 (140,598 with a measured cell-body position) |
| Connections | 6,235,682 |
| Synapses behind them | 89,731,551 |

Each neuron is excitatory or inhibitory according to its main
neurotransmitter: GABA and glutamate count as inhibitory, everything else as
excitatory. That gives 51,320 inhibitory neurons. It is a common modelling
assumption, not receptor-level biology.

The neurons are sorted into six regions, which are the colours you see in
the brain view:

| Region | Neurons |
| --- | --- |
| Visual circuits (optic lobes) | 93,392 |
| Visual projections | 9,763 |
| Central brain | 32,342 |
| Motor output (descending and motor neurons) | 2,122 |
| Ventral nerve cord | 21,729 |
| Other senses | 4,555 |

## The neuron model

Each neuron has a firing rate `a`. Every step, it sums the input from all its
presynaptic partners and updates:

```
drive_i = relu( κ · Σ a_src · sign_src · synapses_e · exp(gain_e) / total_synapses_i
                + bias_i + board_input_i )
a_i    ← (1 − α) · a_i + α · drive_i / (1 + drive_i)
```

- α = 0.65 and κ = 0.95.
- The network starts at rest and runs **10 steps** per position.

**Fixed:** which neuron connects to which, how many synapses each connection
has, and each neuron's sign. That is the anatomy.

**Learned:**
- A gain for every connection. Gains start at 1× and training nudges them.
- A bias for every neuron.
- A small input layer that turns the board into drive.
- A readout that turns the brain's final state into a move.

## How it sees the board

The board is always shown from the side to move. When the fly plays Black,
the board is mirrored for it.

- **Eyes.** 23,720 optic-lobe neurons have a known column position in the
  fly's eye. Each column is mapped onto a board square, and those neurons
  receive 14 channels per square: 6 of its own piece types, 6 of the
  opponent's, the squares it attacks, and the squares attacked by the
  opponent.
- **Other senses.** The 4,555 "other senses" neurons receive 20 facts about
  the game: castling rights, check, en passant, game phase, the 50-move
  counter, and a sense of material (piece counts and balance).

## How it decides

After 10 steps, the activity of **8,266 readout neurons** is read out. These
are all 2,122 motor and descending neurons, plus 2,048 each from the central
brain, the visual projections and the deep optic lobe. A small two-layer
network (8,266 → 512 → 512) turns that activity into:

- **Policy:** how much it likes each of the 4,096 from-to moves. This is its
  instinct.
- **Reply:** which answer it expects from you.
- **Three value heads:** how good the position is now, in 8 half-moves, and
  at the end of the game.

The policy is not restricted to legal moves during training, so the fly has to
learn the rules too.

On held-out positions:
- its raw first choice is a legal move 89% of the time;
- about 64% of its instinct lands on legal moves.

The planner only ever plays legal moves.

## Thinking

The three levels use the same brain, only the search differs:

- **Reflex** plays the policy's top legal move.
- **Planner** imagines its 3 best candidates and your 2 best replies to each.
  It judges every imagined position with its own value heads and picks the
  move with the best outcome (minimax).
- **Thinker** repeats that search in stages: 3×2, then 4×3, 6×4, 8×5, and
  deeper, until its time is up.

Search also uses two habits:
- Winning captures and queen promotions are always considered, even when
  instinct ranks them low.
- A position that has already appeared in the game counts as a draw.

Checkmate and stalemate are recognised by the rules, not guessed.

## Running in the browser

- The connectome and weights are checked against SHA-256 and handed to a
  Web Worker.
- The 10 propagation steps run as a WebGPU compute shader when available,
  and on the CPU otherwise. A browser test checks that both give the same
  numbers.
- Weights are stored as int8 or float16. A test checks that the TypeScript
  inference matches the PyTorch trainer on fixed positions.

## The brain view

Before each move, the worker also records the propagation for the position
on the board: activity after every one of the 10 steps, and the total signal
each region sends to each other region per step. This is computed on the CPU
and not counted against thinking time.

- **The 3D cloud** plays those frames back. Neurons that are switching on
  flash, and gold marks the readout neurons.
- **The flow diagram** shows the same recording as particles moving between
  regions: green for excitation, red for inhibition.

Everything you see comes from that recording. Nothing is generated just for
effect.
