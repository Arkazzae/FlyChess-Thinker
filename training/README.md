# Train DROSO-1

DROSO-1 is a chess model trained from scratch on the fixed FlyWire v783
connectome. This directory contains its data preparation, training, evaluation
and export code. The released model is the former **v10, arm B**, completed
on 23 September 2026.

- [Training recipe](../docs/droso-1/recipe.md): setup, data, losses and commands.
- [Research](../docs/droso-1/research.md): design decisions and the A/B experiment.
- [Benchmarks](../benchmarks/droso-1/README.md): measured results, JSON and PGN.
- [Pretrained model](../artifacts/droso-1/README.md): run inference without training.

Run Python commands from this directory. `droso1/` contains the model-specific
pipeline; `core/` contains shared encoding, visual mapping and PUCT search.
The top-level Python modules provide sparse dynamics, legacy shard import and
checkpoint persistence. The NumPy/checkpoint format identifiers retain their
original version numbers for compatibility; the public model name is DROSO-1.

```bash
python -m unittest discover -s droso1 -t . -p 'test_*.py'
python -m unittest test_training_state
```

Training needs Linux (or WSL2), Python 3.12 and CUDA. Inference also runs on CPU.
The original 10.26-million-position corpus and optimizer checkpoints are not
included. Use the recipe to build your own corpus and start a new run; the
included model bundle is for inference, not exact optimizer resume.
