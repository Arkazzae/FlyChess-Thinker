# fly-v6

The fly you play in FlyChess. Trained by Arkazzae.

| | |
| --- | --- |
| Training steps | 61,465 |
| Position presentations | 15,735,040 (repeats counted) |
| Trained | 18–21 Sep 2026; v6 itself took ~3 h on one RTX 4070 SUPER |
| Weights SHA-256 | `2c4a64df6d61b832d709b8a17edee35e0b798a330c01d7be3d99ea0561f1413f` |
| Connectome SHA-256 | `e7c39f014763a2d6aa4eb1fe2041820b46d60918020b2301dc8f409990246745` |

## What changed

v6 continues v5, which grew out of v1–v4. It trained much longer, from 8.8 M
to 15.7 M presentations, at v5's final low learning rate held constant.

The data mix it saw:
- 60% Lichess positions analysed by Stockfish;
- 32% positions from its own games, labelled with the cost of the move it
  actually played;
- 7% Stockfish self-play.

## Measured

| Level | vs Stockfish 1320 (32 games) | Elo |
| --- | --- | --- |
| Reflex (policy only) | 4 W · 6 D · 22 L | 1099 |
| Planner (3 × 2 search) | 12 W · 7 D · 13 L | 1309 |
| Thinker (6 × 4 search) | 17 W · 0 D · 15 L | 1342 |

On held-out positions, its first choice is Stockfish's best move 28.6% of the
time. The best move is among its top 3 in 52.3% of positions. Its raw top
choice is a legal move 89.4% of the time.

Later experiments (v8, v9) did not beat it; v9 lost 16 of 16 games to v6.

See [docs/training.md](../../docs/training.md) for the full recipe.
