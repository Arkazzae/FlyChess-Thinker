# DROSO-1 training recipe

DROSO-1 uses a fixed FlyWire v783 connectome with trainable connection gains,
neuron biases, sensory inputs and a neural readout. The released model is
arm B of the original v10 experiment: **101,563 steps and 26,000,128 position
presentations**, trained from fresh weights. Presentations include repeated
sampling; they are not a count of unique positions.

The [pretrained bundle](../../artifacts/droso-1/README.md) works immediately.
The instructions below create a new model with the same training method.
The historical corpus and full AdamW checkpoint are not distributed, so a new
corpus will not reproduce the released weights exactly. Original settings,
source inventories and results are retained in the [benchmark archive](../../benchmarks/droso-1/README.md).

## 1. Set up the environment

Use Linux or WSL2, Python 3.12, a CUDA-capable NVIDIA GPU, and Stockfish 19.
The original run used an RTX 4070 SUPER. A full-graph A/B smoke run allocated
about 3.77 GB of CUDA memory; this excludes some runtime overhead. The final
training stage processed roughly 1,285 presentations per second. Reserve at
least 25 GB of disk space for a corpus of the original size, plus checkpoints.

From the repository root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r training/requirements.txt
cd training
export STOCKFISH_EXECUTABLE=/absolute/path/to/stockfish
python -m unittest discover -s droso1 -t . -p 'test_*.py'
python -m unittest test_training_state
```

The requirements record the tested NumPy, chess and PyTorch versions. Install
the matching CUDA build of PyTorch for your driver; verify
`python -c 'import torch; print(torch.cuda.is_available())'` prints `True`.
The importer also needs `curl` and `zstd`. Stockfish is used for data labels
and evaluation, and does not choose the model's moves during inference.

The exact graph is included at `artifacts/droso-1/graph.npz`. The trainer
checks its SHA-256 before starting. It initializes fresh learned parameters;
it does not load the released weights when starting a new run.

## 2. Build or supply the corpus

Place compressed NumPy shards in `training/data/shards/`. Each has a `records`
array with the structured dtype defined in `generate.py`. Filenames identify
the source: names containing `lichess`, names containing `dagger`, and all
other names for generated games. Keep generated games contiguous and preserve
filenames, game IDs and promotion fields.

For an existing compatible corpus, copy its shards into that directory.
To create a new corpus, run the following from `training/`:

```bash
mkdir -p data/shards
python generate.py --out data/generated --workers 2 --target 1900000 --depth 12
python import_lichess.py --out data/lichess --positions 8000000 --min-depth 18
python -m droso1.collect --bundle ../artifacts/droso-1 --out data/dagger \
  --games 48 --rounds 1000 --labellers 2 --depth 10
cp data/generated/*.npz data/lichess/*.npz data/dagger/*.npz data/shards/
```

These are substantial data collection jobs, not a quick smoke test. The DAgger
command collects mistakes from the released DROSO-1 player; the historical
run used mistakes collected from earlier models. `--rounds` controls collection
rounds, not an exact record count. Keep all three sources populated. Split
selection reserves 12 DAgger, 6 generated and 3 Lichess shards, and needs enough
additional shards for training plus quiet, tactical and endgame examples in
each reserved split. A smaller corpus may fail these quotas with an explicit
error; do not silently replace missing evaluation strata with training data.

The original audited corpus contained:

| Source | Unique positions | Sampling share |
| --- | ---: | ---: |
| Lichess evaluations | 7,534,648 | 60.496% |
| DAgger mistakes | 965,712 | 32.393% |
| Generated games | 1,763,564 | 7.111% |
| Total | 10,263,924 | 100% |

Sampling shares are independent of source sizes. The original corpus had
264,336 valid mistake-cost labels, 1,612,484 actual future-CP labels,
1,763,564 game results and 9,957,182 reply labels. No native WDL labels were
used in training.

## 3. Prepare and audit

```bash
python -m droso1.prepare --shards data/shards --out data/droso-1 --workers 2
python -m droso1.reindex --data data/droso-1
python -m droso1.audit --data data/droso-1
```

Preparation validates standard-chess positions and legal targets, writes
memory-mapped arrays, and reserves dev/validation/test pools of 256/512/512
positions. It also reserves 8/16/32 match openings, each played with both
colours. Held-out roots, immediate legal children and known source groups are
excluded from training. Imported game identities were not retained by the old
format, so source-game isolation cannot be guaranteed for every import.

The reindex step is required: global deduplication prefers a record with a
valid mistake cost, then one with actual game context, then deterministic
source order. The audit verifies hashes, target legality, sampler indices,
split separation and sampled reconstruction from original records. Keep the
original shards accessible for this audit. Use a new output directory when
changing source data or preparation code.

## 4. Train

To train the released B recipe directly:

```bash
python -m droso1.train --data data/droso-1 --run runs/my-droso-1 \
  --arms B --target-seen 26000128
```

For a short pipeline check, use a separate run directory and `--max-steps 4`.
Discard that run before the official experiment. To repeat the research pilot,
start `--arms A B --target-seen 1048576` in a new directory, compare on
validation, then continue the selected arm with `--resume`. The original
experiment continued B through 4, 8, 16 and 26 million presentations.

| Setting | Value |
| --- | --- |
| Seed | 2026092301 |
| Batch size | 256 |
| Dynamics / gradient steps | 10 / last 4 |
| Edge-gradient sample | 96 examples per batch; all edges remain present |
| Readout hidden width | 512 |
| Optimizer | AdamW, betas (0.9, 0.98) |
| Connection-gain and neuron-bias learning rate | 0.00002 |
| Other learning rate | 0.00006 |
| Warmup | 400 steps, then constant learning rates |
| Weight decay | 0 for gains/biases; 0.0001 for other parameters |
| Gradient clipping | Global norm 1.0 |
| Gain regularization | 0.001 × mean squared log-gain |
| BatchNorm calibration | Fixed 3,072-example training-only pool before saves |

Check `status.json`, `metrics.jsonl` and `recipe.json` inside the run directory.
`last.pt` stores the model, AdamW moments, RNG, sampling step and normalization
statistics. Snapshots preserve intermediate candidates.

### Losses

The policy has **4,168 actions**, including distinct queen, rook, bishop and
knight promotions. MultiPV scores create a soft target at temperature 120 cp.
Policy loss is 0.6 legal-action cross-entropy plus 0.4 full-output cross-entropy.
Reply loss has weight 0.5 and is averaged over valid reply labels in the
replying side's coordinate frame.

The current value target is `tanh(cp / 600)`, from the side to move. Its per-row
coefficient is `2 / k`, where `k` counts the genuinely available current,
future and outcome labels. B retains that denominator for a matched A/B
comparison even though it uses only the current-value loss. A additionally
learns actual CP eight plies ahead and known game results, with consistency
weight 0.25. Missing future labels are never replaced with current CP.

Mistake loss has weight 0.5: for a known bad move costing at least 100 cp,
penalize `-log(1 - p_bad) × min(cost, 600) / 300`, summed over valid mistakes
and divided by the full batch size. Policy/value examples have weights 2.5
for the recorded sacrifice heuristic, 1.5 for the poisoned-capture heuristic,
and 1 otherwise, normalized by the sum of weights. Reply and mistake losses
use their own denominators. The implementation is in
[`loss.py`](../../training/droso1/loss.py).

### Pause and resume

Create `runs/my-droso-1/PAUSE`, press Ctrl+C, or send SIGTERM to request a save
at the next safe boundary. Wait for the process to exit, then resume:

```bash
python -m droso1.train --data data/droso-1 --run runs/my-droso-1 \
  --arms B --target-seen 26000128 --resume
```

The target is the total exposure, not additional exposure, and must be a
positive multiple of 256. Resume checks code, data and graph hashes and keeps
the sampler step and optimizer state. Use checkpoints created by this port:
renaming modules changes code hashes, so archived research checkpoints are
not accepted for exact resume by the port. The released inference bundle has
no optimizer state.

## 5. Evaluate, select and export

Evaluate a frozen checkpoint on validation. You can also compare its chosen
moves and paired games against the released bundle:

```bash
python -m droso1.evaluate --checkpoint runs/my-droso-1/last.pt --arms B \
  --bundle ../artifacts/droso-1 --data data/droso-1 --split validation \
  --games --out runs/my-droso-1-validation
python -m droso1.harmonize \
  --input candidate=runs/my-droso-1-validation/fresh_B-regret.json \
  --input release=runs/my-droso-1-validation/DROSO-1-regret.json \
  --out runs/my-droso-1-validation/common-teacher
```

Use the common-teacher reports: both chosen moves receive the same node budget
and root evaluation. Select using validation, freeze the candidate, then run
one final evaluation with `--split test --final` and a fresh output directory.
The evaluator caps paired games at 200 plies and reports any Stockfish
adjudications separately. For a rating probe, use `droso1.rating_match`, whose
512-ply limit leaves unfinished games unresolved instead of assigning results.

```bash
python -m droso1.export --checkpoint runs/my-droso-1/last.pt --arm B \
  --out exports/my-droso-1
cd exports/my-droso-1
python -m droso1.bundle --device cuda --moves e2e4 c7c5
```

Export creates a standalone Python runtime, compressed lossless NumPy weights,
graph, checksums and verification report. It verifies tensors, FP32 outputs,
CUDA outputs, promotions, chosen moves and a separate-process launch.

The browser supports this model's 15 square features, 22 global features,
4,168 actions and PUCT search. From the repository root, export the bundle:

```bash
PYTHONPATH=training python -m droso1.export_browser --bundle artifacts/droso-1
pnpm check
CHROMIUM_PATH=/usr/bin/chromium pnpm test:fly:browser
```

For a newly trained bundle, replace `artifacts/droso-1` with its export path.
The browser exporter preserves FP32 weights and creates checksum manifests
and PyTorch reference fixtures. It downloads and verifies the pinned soma
annotations, or accepts `--annotations /path/to/annotations-v2.1.0.tsv`.
