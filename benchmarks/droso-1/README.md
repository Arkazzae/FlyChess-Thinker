# DROSO-1 benchmarks

These results describe the released **DROSO-1** model (historical v10 arm B,
26,000,128 presentations), evaluated on 23 September 2026. The weights were
frozen before evaluation. The player uses **64 PUCT simulations**,
`c_puct = 1.5`, current-CP value and no per-move time limit.

## Stockfish rating probe

| Opponent | Wins | Draws | Losses | Score | Conditional performance |
| --- | ---: | ---: | ---: | ---: | ---: |
| Stockfish 19, UCI_Elo 1320 | 21 | 5 | 6 | 73.44% | 1496.66 |
| Stockfish 19, UCI_Elo 1500 | 12 | 8 | 12 | 50.00% | 1500.00 |
| Combined | 33 | 13 | 18 | 61.72% | **1498.54** |

The 95% bootstrap interval is **1410.00–1603.33**, resampling 13 opening
families across both colours and opponent levels. Stockfish used requested
depth 8, one thread and 16 MB hash. Sixteen openings were each played with
both colours against both levels. All 64 games ended naturally, had legal
PGNs and distinct trajectories. None reached the 512-ply technical limit.

This is a rating relative to those Stockfish settings, not a FIDE, Lichess or
Chess.com rating. Stockfish documents UCI_Elo calibration at 120 seconds plus
1 second per move; a depth-limited test uses different conditions. The
interval covers sampled opening variation, not systematic calibration error.
See the [official UCI documentation](https://official-stockfish.github.io/docs/stockfish-wiki/UCI-Protocol-and-Stockfish-Commands.html).

Evidence: [rating and intervals](rating/rating.json), [protocol](rating/protocol.json),
[audit](rating/audit.json), [1320 results](rating/sf1320/report.json),
[1320 PGN](rating/sf1320/games.pgn), [1500 results](rating/sf1500/report.json)
and [1500 PGN](rating/sf1500/games.pgn).

Recompute the statistics from the archived match reports, from `training/`:

```bash
python -m droso1.rating_summary \
  --input ../benchmarks/droso-1/rating/sf1320/report.json \
  --input ../benchmarks/droso-1/rating/sf1500/report.json \
  --out /tmp/droso-1-rating.json
```

To run new games against Stockfish, configure `STOCKFISH_EXECUTABLE` and use
`python -m droso1.rating_match --bundle ../artifacts/droso-1 --elo 1500 --out runs/rating-1500`.
New results may differ because Stockfish's handicap randomness is not seeded
through UCI. No published games need to be rerun to inspect the archived results.

## Held-out match against fly-v6

DROSO-1 scored **37 wins, 10 draws and 17 losses**: 42/64 points, or **65.625%**.
All games ended naturally. The 32 starting positions were played with both
colours and came from 19 source games. The 95% interval, clustered by those
source games, is **56.45%–75.00%**.

Both players used PUCT 64; fly-v6 used its native value-head mixture.
This differs from fly-v6's browser planner, so this comparison should not be
combined with the browser's level ratings. The candidate was selected on
validation before opening this final test.

Evidence: [64 games](final-test/games.pgn), [full report](final-test/report.json)
and [source-game audit](final-test/source-game-audit.json).

## Held-out move quality

| Metric | DROSO-1 | fly-v6 |
| --- | ---: | ---: |
| Severe errors / 512 positions | 61 | 56 |
| Severe-error rate | 11.91% | 10.94% |
| Mean regret on 448 common CP positions | 85.94 cp | 82.29 cp |
| Quiet-position errors / 258 | 26 | 25 |
| Tactical-position errors / 127 | 20 | 20 |
| Endgame errors / 127 | 15 | 11 |

A severe error means losing at least 300 cp, losing a forced mating win or
allowing a forced mating loss according to the teacher. The difference in
error rates is +0.98 percentage points, with a 95% grouped interval of
−5.33 to +2.07. Mean CP regret differs by +3.65 cp, with an interval of
−46.00 to +14.04. These intervals do not establish a difference in move quality.

Stockfish 19 evaluated the move actually chosen, starting at 200,000 nodes
and confirming selected cases at 1,000,000. Compared moves share the same
per-position node budget and root analysis. Mate scores remain separate from
CP; the 64 positions without a common CP score are retained in the severe-error
metric. Bootstrap groups are known source games or imported source shards.

Evidence: [common-teacher summaries](final-test/common-teacher/report.json),
[DROSO-1 moves and scores](final-test/common-teacher/fresh_B-regret.json),
[fly-v6 moves and scores](final-test/common-teacher/historical_v6-regret.json)
and [paired comparison](final-test/paired-v6.json).

## Training and selection

| B presentations | Severe errors / 256 dev | Match against fly-v6 (W/D/L) |
| --- | ---: | --- |
| 1,048,576 | 60 | — |
| 4,000,000 | 33 | 3 / 1 / 12 |
| 8,000,000 | 29 | 3 / 2 / 11 |
| 16,000,000 | 29 | 8 / 5 / 3 |
| 26,000,128 | 26 | 12 / 1 / 3 |

Dev error counts use the final common-teacher analysis, which can differ from
the adaptive-budget numbers available during training. The early 4M and 8M
matches each included one adjudicated game. All games at 16M and 26M ended
naturally. Dev was repeatedly inspected and is not an independent test.

The final validation comparison had 68/56/53 severe errors for B at 8M/16M/26M.
The predefined rule chose 26M for its lowest validation count. Its difference
from 16M was −0.59 percentage points, with interval −2.60 to +1.28. Candidate
selection preceded the first final-test access; the test did not change it.

Evidence: [final dev analysis](growth-B-26000128/common-teacher/report.json),
[A/B validation](validation-common-teacher/report.json),
[A/B games](pilot-validation/games.pgn),
[final validation](validation-final-common-teacher/report.json),
[16M–26M comparison](validation-final-common-teacher/paired-16m-26m.json),
[selection rule](training/final-selection-protocol.json) and
[frozen candidate](training/final-candidate.json).

## Archive and reproduction

[data/](data/) contains the historical evaluation positions, openings, dataset
manifest and audit. The 10.26-million-position training corpus is not included.
The published test has already been used; use a new holdout when making new
model-selection decisions. [training/](training/) records the historical
recipe, checkpoint audit and original export verification.

Historical machine identifiers such as `fresh_B`, `v10` and `historical_v6`
remain in archived evidence so it can be traced to the original experiment.
Workstation-specific path prefixes have been replaced with `source/` or
`source-workspace/`; these are provenance references, not local file paths.
[provenance.json](provenance.json) records both original and imported file hashes.
Hashes embedded inside old reports refer to the original files. The current
bundle has its own [manifest](../../artifacts/droso-1/manifest.json) and
[verification](../../artifacts/droso-1/verification.json).

The [port verification](port-training-verification.json) records a disposable
full-graph training check: paired A/B initialization, B-only resume with A and
its AdamW state unchanged, the exact next sampler batch, updated B gains and
a verified standalone export. This validates the imported pipeline; it is not
additional training of the released model or a new strength measurement.
