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

Elo from 32 games per level against Stockfish 1320:

| Level | Elo |
| --- | --- |
| Reflex | 982 |
| Planner | 1397 |
| Thinker | 1320 |

With 32 games per level, the gap to v6 is within the noise, except for
instinct: v6 plays about 120 points better without search.
