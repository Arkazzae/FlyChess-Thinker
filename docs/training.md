# How the browser fly was trained

For **DROSO-1**, the newer FlyWire research model, see the
[training recipe](droso-1/recipe.md), [research](droso-1/research.md),
[benchmarks](../benchmarks/droso-1/README.md) and
[pretrained model](../artifacts/droso-1/README.md).

The model shipped here is **fly-v6**, trained by Arkazzae: 61,465 training steps and 15,735,040
position presentations (a presentation counts repeats, so it is not the number
of unique positions). The training code lives in a separate research
workspace for these historical versions. This page summarises what it did;
the DROSO-1 pipeline is now included in this repository.

## Teacher and data

The teacher is **Stockfish 19**. The fly learns to imitate its judgement;
nobody gave it chess heuristics.

| Source | Records | Share of what the fly saw |
| --- | --- | --- |
| **Lichess evaluation database**: positions analysed at depth ≥ 18, up to 3 best lines | 8,000,000 | 60% |
| **Its own mistakes (DAgger)**: the fly plays games, Stockfish labels every position it reached and the cost of the move it actually chose | 1,071,057 | 32% |
| **Generated games**: Stockfish self-play with book openings, random starts and deliberate second-best moves; top 3 moves, reply, outcome | 1,889,635 | 7% |

The mistake data came from games against a ladder of opponents: itself,
weakened Stockfish mixes and Stockfish 1320.

## What it is taught

Every position trains several targets at once:

| Target | Built from |
| --- | --- |
| **Move choice (policy)** | A soft target over Stockfish's top 3 moves, weighted by how close each is to the best. 40% of this loss covers all 4,096 moves (legal or not), 60% only legal moves. |
| **Opponent's reply** | The second move of Stockfish's best line |
| **Position now** | tanh(centipawns / 600) |
| **In 8 half-moves** | The same, 8 plies later in the game |
| **Game result** | Win, draw or loss, only where the game is known |
| **"Pain"** | On its own mistakes that cost ≥ 100 centipawns: a penalty for still liking that move |
| **Consistency** | The three value heads have to agree with each other over time |

Sacrifices count 2.5× and "poisoned" captures 1.5×, so the fly does not learn
that grabbing material is always good. A small penalty keeps synapse gains
close to the real anatomy.

Loss weights for v6: policy 1, reply 0.5, value 2, pain 0.5,
consistency 0.25.

## Optimisation

- AdamW, batch size 256, gradients clipped at 1.0.
- Gradients flow only through the last 4 of the 10 brain steps. The first 6
  run without gradient, to fit in memory.
- Gradients for the 6.2 million connection gains are estimated from 96 of
  the 256 positions in each batch.
- Before every evaluation and save, the readout's normalisation statistics
  are recomputed. Without this, the share of positions where the fly's first
  choice matches the teacher's best move dropped from 22% to 11%.
- v6 continued from v5 at the final learning rate of v5's schedule:
  2·10⁻⁵ for gains and biases, 6·10⁻⁵ for everything else.

## Versions

| Version | Change | Presentations | Measured strength |
| --- | --- | --- | --- |
| v1 | Trained from scratch | 1.7 M | ~650–800 |
| v2 | 11 material features added to the game-state input | 3.8 M | ~800–940 |
| v3 | Its own mistakes (DAgger) and the pain term | 4.9 M | up to ~1320 |
| v4 | More Lichess data, stronger legal-move training, consistency | 6.5 M | 1027 / 1334 / 1342 |
| v5 | Stronger consistency | 8.8 M | not measured |
| **v6** | **Longer training at a low, constant learning rate** | **15.7 M** | **1114 / 1273 / 1309** |

Strength is shown as reflex / planner / thinker Elo, where measured.

Later experiments (v8, v9) trained from scratch with smaller datasets and
different value targets. Neither beat v6. In a direct match v9 lost all 16
games to v6, so v6 stayed the default.

Training v1 through v6 took about 7 hours of active training. v6 ran on an
RTX 4070 SUPER for about 3 hours, at roughly 650 positions per second;
earlier versions ran on the same workstation.

## Measurements

Each level played 96 games against Stockfish limited to 1320 Elo, alternating
colours: 32 right after training and 64 more on 23 Sep 2026, pooled. Stockfish
had 30 ms per move, and games unfinished after 200 plies were decided by a
Stockfish evaluation.

| Brain | Level | Win / draw / loss | Elo estimate (95% ≈ ±65) |
| --- | --- | --- | --- |
| fly-v6 | Reflex | 13 / 19 / 64 | 1114 |
| fly-v6 | Planner | 33 / 17 / 46 | 1273 |
| fly-v6 | Thinker | 42 / 9 / 45 | 1309 |
| fly-v4 | Reflex | 9 / 12 / 75 | 1027 |
| fly-v4 | Planner | 44 / 12 / 40 | 1334 |
| fly-v4 | Thinker | 45 / 12 / 39 | 1342 |

The first 32-game probe had put v4's Planner at 1397. With three times the
games it settles near 1330. With search, v4 and v6 are about equally strong.
v6 is clearly better only on pure instinct.

Other checks:
- **Teacher's move.** On held-out positions, the fly's first choice is
  Stockfish's best move 29% of the time, and among its top 3 moves 52% of
  the time.
- **Tactics.** In a small set of 15 tactical tasks it always takes free
  material. Mates in two are hard.
- **Endgames.** When thinking, it mates with king and queen and with king
  and pawn, playing either colour. With king and rook it won one of the two
  games; the other was drawn by the 50-move rule.
- **Comparison.** At the same amount of training, a plain neural network
  without the connectome matched the teacher's best move less often:
  18.5% of the time, against the fly's 21.3%.

## Limitations

- This is a rate model. It has no spikes, no synaptic delays and no
  biological learning. Excitatory or inhibitory by transmitter is a
  simplification.
- The fly learns from Stockfish labels. It does not discover chess on its
  own.
- The mapping from eye columns to squares is rough: 14 of the 64 squares
  have no visual neurons of their own and are seen only indirectly.
- Most connection gains barely moved from the anatomy (median change about
  1%). Most of the learning sits in the input, the biases and the readout.
- Promotions are always to a queen.
- The Elo figures are on Stockfish's scale from small samples, not FIDE
  ratings.
