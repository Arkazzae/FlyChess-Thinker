# DROSO-1 research

DROSO-1 tests whether a fresh model built on the FlyWire v783 connectome can
learn useful chess play with corrected supervision and a controlled training
recipe. The released weights are the original v10 arm B, renamed without
changing any learned tensor.

## Architecture

The fixed graph has **134,181 neurons and 2,700,513 directed connections**,
representing 34,153,566 synapses after retaining connections with at least
five synapses. Connection counts, neuron identities and transmitter signs
stay fixed. Trainable log-gains scale the anatomical connections; neuron
biases, sensory weights and the readout are also learned.

A rate model runs ten propagation steps from rest. Its activity saturates as
`drive / (1 + drive)`, with update factor 0.65 and recurrent scale 0.95.
Training differentiates through the last four steps. Edge gradients use 96
examples from each 256-example batch to reduce memory use.

The sensory interface covers all 64 squares, using 15 features per square
and 22 global features. It encodes en passant and explicitly marks unknown
halfmove clocks and whether repetition history is known. The history-known
flag stays false in the training records and search encoder; chess-rule
checks use the available game history separately. The complete-square mapping
replaces the older mapping, which left 14 squares without direct visual input. The
published graph provenance describes that older mapping; the model constructs
the corrected mapping at initialization.

The readout combines descending/motor neurons with fixed samples from visual
and central regions, followed by two 512-wide layers. Policy and reply each
have 4,168 actions, including all four promotion types. During play, PUCT uses
only the current `tanh(CP / 600)` value, plus terminal chess rules. Auxiliary
reply, future and outcome outputs do not enter the search value.

## Why rebuild the recipe?

The older fly-v6 was a useful baseline, but its strength followed several
training stages and data changes. Later experiments changed several factors
at once, so their losses could not identify which ingredient mattered.
DROSO-1 starts with new learned weights, BatchNorm statistics and AdamW state
on a fixed graph, and changes one supervision package in the A/B pilot.

The data contract also fixes several ambiguities: replies use the replying
side's coordinates; promotions retain their piece type; absent outcomes and
future evaluations are masked; and recorded DAgger mistake costs are kept
during deduplication. Current CP is never copied into an invented future label.

## Controlled A/B pilot

Both arms used identical initialization, batches, step seeds, optimizer
settings and current-CP coefficients:

| Arm | Supervision |
| --- | --- |
| A | Policy, reply, current CP, mistake cost, actual future CP, known outcome, temporal consistency |
| B | Policy, reply, current CP and mistake cost |

Each received 1,048,576 presentations. On 512 validation positions, A made
126 severe errors and B made 124. Their 32-game match ended 13 A wins,
7 draws and 12 B wins. That result did not establish a benefit from the
auxiliary package, so the experiment continued the simpler B recipe under
the predefined selection rule. It does not establish equivalence or show
that auxiliary tasks cannot help with more training.

B continued to 4, 8, 16 and 26 million presentations. At final selection,
validation severe-error counts were 68, 56 and 53 for the 8M, 16M and 26M
checkpoints. The final selection compared 16M with 26M; 8M was included only
as a historical reference. The rule selected the lowest count among those
two candidates, then common-subset mean CP cost in a tie, then the earlier
checkpoint. The 26M candidate was frozen before the final test was opened.

## Findings

DROSO-1 beat fly-v6 **37–10–17** in the 64-game held-out match, with both
players using 64 PUCT simulations. Its separate Stockfish probe yielded
approximately 1500 conditional Elo. However, on 512 held-out positions it
made 61 severe errors against fly-v6's 56, and the uncertainty interval did
not establish a difference in single-move quality. See the
[benchmark report](../../benchmarks/droso-1/README.md) for conditions and data.

Longer training improved match results but did not improve every diagnostic.
The final model matched reference moves on 13 of 15 known tactical tasks;
an earlier checkpoint had reached 15/15 at PUCT 256. The final model also
retained a known 671-cp mistake. More search did not consistently fix these
errors. These small, previously inspected tasks are regression checks, not
an independent strength estimate.

Connection gains changed during training: 1,780,206 edges had nonzero
log-gains in the final checkpoint. This confirms that optimization reached
the graph parameters. It does not isolate the contribution of biological
topology. Comparison with fly-v6 also changes anatomy, interfaces, training
history and data exposure; it is not a topology-only ablation.

## Limits and useful next experiments

The experiment has one initialization seed. Dev and validation were reused
for development and selection; only the final test was reserved until the
candidate was frozen. That test is now public and should be treated as a
regression set for future work. Imported source-game identities and some
teacher metadata were lost, limiting leakage and label-quality checks.
The holdout was reserved for the fresh DROSO-1 experiment; the legacy fly-v6
baseline may have encountered some corpus positions during its earlier training.

The model uses rate dynamics and backpropagation, not biological learning.
Treating GABA/glutamate as inhibitory is a modeling assumption. Stockfish
labels teach chess; the connectome is an architectural constraint.

Further experiments should isolate data quality, endgame coverage and fresh
mistakes from the current player, use new held-out games and additional
seeds, and compare longer matched A/B runs. A matched non-connectome control
is needed before attributing gains to the biological wiring.

## Sources

The graph derives from the FlyWire Consortium's
[connectivity release 783](https://zenodo.org/records/10676866), with annotations
and optic-column assignments pinned in
[graph provenance](../../artifacts/droso-1/graph-provenance.json).
The [training recipe](recipe.md) and [original experiment evidence](../../benchmarks/droso-1/provenance.json)
record the implementation and measured results. Session transcripts,
consultation logs and repeated intermediate commentary are omitted.
