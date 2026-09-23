# fly-v4

The previous public fly, kept for comparison.

| | |
| --- | --- |
| Training steps | 25,475 |
| Position presentations | 6,521,600 (repeats counted) |
| Trained | 18–19 Sep 2026 |
| Weights SHA-256 | `8243c4a15481bf96a978442def509f15226d33469b7a9d495f6881939cc736b7` |
| Connectome SHA-256 | `e7c39f014763a2d6aa4eb1fe2041820b46d60918020b2301dc8f409990246745` |

## What changed

Warm start from v3. Changes against v3:
- twice as much Lichess data in the mix;
- stronger training on legal moves (60% of the move loss counts legal moves
  only);
- a consistency term that asks its three value heads to agree over time.

It learned from:
- Lichess analyses;
- Stockfish self-play;
- its own mistakes (DAgger), weighted 8×.

## Measured

96 games per level against Stockfish 1320 (about ±65):

| Level | Win / draw / loss | Elo |
| --- | --- | --- |
| Reflex | 9 / 12 / 75 | 1027 |
| Planner | 44 / 12 / 40 | 1334 |
| Thinker | 45 / 12 / 39 | 1342 |

The first probe (32 games) had the Planner at 1397. The larger sample puts it
near 1330. With search, v4 is level with v6. Without search, v6 is about 90
points better.
