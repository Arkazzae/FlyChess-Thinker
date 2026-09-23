# Training DROSO-1

The released model was trained from scratch on the FlyWire v783 connectome.
It is the original v10 arm B checkpoint after **26,000,128 sampled position
presentations** and **101,563 steps**. Presentations include repeated samples.

The repository includes everything needed to implement the recipe and run the
trained model:

- [Training recipe](droso-1/recipe.md): environment, data preparation, losses,
  training, evaluation and export commands.
- [Python pipeline](../training/README.md): runnable entry points and dependencies.
- [Research](droso-1/research.md): the paired experiment and its limitations.
- [Benchmarks](../benchmarks/droso-1/README.md): conditions, results, JSON and PGNs.
- [Pretrained artifact](../artifacts/droso-1/README.md): standalone inference
  bundle with weights, graph and verification fixtures.

The recipe teaches legal-move policy and the current CP value using Stockfish
labels, Lichess evaluations and positions from model games. Its auxiliary
reply, future-value and outcome heads are not supervised and are not used by
the browser's search. The graph stays fixed throughout training.

Use Python 3.12 and a compatible CUDA PyTorch installation for training.
The original full training corpus and optimizer state are not included; the
recipe explains how to prepare a new corpus. The released inference bundle
can run on CPU without Stockfish or the original workspace.

The browser runs the same checkpoint with 15 square features, 22 global
features and 4,168 actions. Its three play styles use 8, 32 and 64 PUCT
simulations. Only the 64-simulation setting has the published rating probe:
about 1500 on that limited-Stockfish protocol, with a 95% interval of 1410–1603.
This is not a FIDE or website rating.
