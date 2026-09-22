/**
 * Fly brain inference (CPU). The same rate model as flybrain/model.py:
 *
 *   drive_i = relu( sum_e a_src(e) · sign_src · count_e · exp(g_e) · kappa / sum counts_i + bias_i + input_i )
 *   a_i    ← (1 − alpha) · a_i + alpha · drive_i / (1 + drive_i)
 *
 * Anatomy (edges, synapse counts, transmitter signs) is measured; gains, biases,
 * the sensory interface and the readout were trained against Stockfish.
 */

import type { Connectome } from "./connectome";
import { GLOBAL_FEATURES, MOVE_SPACE, SQUARE_FEATURES, type EncodedBoard } from "./encoding.ts";
import type { FlyWeights, QuantisedLinear } from "./weights";

export interface BrainOutput {
  /** Unmasked policy logits over 4096 mover-frame from-to pairs. */
  policy: Float32Array;
  /** Expected opponent reply logits (mover frame of the *current* side). */
  reply: Float32Array;
  /** tanh values: [now, eight half-moves ahead, final outcome], side to move perspective. */
  value: Float32Array;
  /** Mean activity per anatomical group after the last step. */
  groups: Float32Array;
}

export const GROUP_COUNT = 6;
/** Per step: 6 × 6 excitatory then 6 × 6 inhibitory group-to-group drive (source row, target column). */
export const FLOW_SIZE = GROUP_COUNT * GROUP_COUNT * 2;

export interface BrainTrace {
  /** (steps + 1) × neurons activity; frame 0 is the resting brain before the board arrives. */
  frames: Float32Array;
  /** steps × FLOW_SIZE summed synaptic drive between anatomical groups. */
  flows: Float32Array;
  steps: number;
}

/** What a neuron does for the chess model: 0 inner, 1 sees a square, 2 senses game state, 3 is read out. */
export const ROLE_INNER = 0;
export const ROLE_VISUAL = 1;
export const ROLE_GLOBAL = 2;
export const ROLE_READOUT = 3;

export class FlyBrain {
  readonly count: number;
  readonly edgeValues: Float32Array;
  readonly bias: Float32Array;
  readonly groupCounts = new Uint32Array(GROUP_COUNT);
  activity: Float32Array;
  private next: Float32Array;
  private readonly input: Float32Array;
  private readonly features: Float32Array;
  private readonly hidden: Float32Array;
  private readonly hidden2: Float32Array;

  readonly graph: Connectome;
  readonly weights: FlyWeights;

  constructor(graph: Connectome, weights: FlyWeights) {
    this.graph = graph;
    this.weights = weights;
    if (weights.neurons !== graph.count || weights.edges !== graph.edges) throw new Error("Weights were trained on a different connectome.");
    const n = graph.count;
    this.count = n;
    this.activity = new Float32Array(n);
    this.next = new Float32Array(n);
    this.input = new Float32Array(n);
    this.bias = weights.bias;
    this.features = new Float32Array(weights.readout.length);
    this.hidden = new Float32Array(weights.hidden);
    this.hidden2 = new Float32Array(weights.hidden);
    // Fold the per-neuron normalisation into every incoming edge once.
    this.edgeValues = new Float32Array(graph.edges);
    for (let i = 0; i < n; i++) {
      this.groupCounts[graph.groups[i]]++;
      let total = 0;
      for (let e = graph.offsets[i]; e < graph.offsets[i + 1]; e++) total += graph.weights[e];
      const norm = total ? weights.kappa / total : 0;
      for (let e = graph.offsets[i]; e < graph.offsets[i + 1]; e++) {
        const gain = Math.exp(((weights.gain[e] / 255) * 2 - 1) * weights.gainMax);
        this.edgeValues[e] = Math.fround(graph.signs[graph.sources[e]] * graph.weights[e] * gain * norm);
      }
    }
  }

  /** External drive per neuron from the encoded board. */
  encode(board: EncodedBoard): Float32Array {
    const w = this.weights;
    const input = this.input;
    input.fill(0);
    for (let k = 0; k < w.visIndex.length; k++) {
      const square = w.visSquare[k] * SQUARE_FEATURES;
      const base = k * SQUARE_FEATURES;
      let sum = 0;
      for (let f = 0; f < SQUARE_FEATURES; f++) sum += board.squares[square + f] * w.visWeight[base + f];
      input[w.visIndex[k]] = sum;
    }
    for (let k = 0; k < w.globIndex.length; k++) {
      const base = k * GLOBAL_FEATURES;
      let sum = 0;
      for (let f = 0; f < GLOBAL_FEATURES; f++) sum += board.globals[f] * w.globWeight[base + f];
      input[w.globIndex[k]] = sum;
    }
    return input;
  }

  /** Run the connectome from rest for the trained number of steps. */
  propagate(input: Float32Array, steps = this.weights.steps): Float32Array {
    const g = this.graph;
    const alpha = this.weights.alpha;
    const keep = 1 - alpha;
    let a = this.activity;
    let b = this.next;
    a.fill(0);
    for (let step = 0; step < steps; step++) {
      for (let i = 0; i < this.count; i++) {
        let sum = 0;
        for (let e = g.offsets[i]; e < g.offsets[i + 1]; e++) sum += a[g.sources[e]] * this.edgeValues[e];
        const drive = sum + this.bias[i] + input[i];
        b[i] = drive > 0 ? keep * a[i] + (alpha * drive) / (1 + drive) : keep * a[i];
      }
      [a, b] = [b, a];
    }
    this.activity = a;
    this.next = b;
    return a;
  }

  /**
   * The same propagation as `propagate`, recorded for the brain view: activity after every step
   * (frame 0 is rest) and the signal each anatomical group sends to each other group per step,
   * split into excitatory and inhibitory drive. Uses its own buffers, so it never disturbs a thought.
   */
  trace(input: Float32Array, steps = this.weights.steps): BrainTrace {
    const g = this.graph;
    const n = this.count;
    const alpha = this.weights.alpha;
    const keep = 1 - alpha;
    const frames = new Float32Array((steps + 1) * n);
    const flows = new Float32Array(steps * FLOW_SIZE);
    const groups = g.groups;
    for (let step = 0; step < steps; step++) {
      const a = frames.subarray(step * n, (step + 1) * n);
      const b = frames.subarray((step + 1) * n, (step + 2) * n);
      const flow = flows.subarray(step * FLOW_SIZE, (step + 1) * FLOW_SIZE);
      for (let i = 0; i < n; i++) {
        const target = groups[i];
        let sum = 0;
        for (let e = g.offsets[i]; e < g.offsets[i + 1]; e++) {
          const source = g.sources[e];
          const activity = a[source];
          if (activity === 0) continue;
          const signal = activity * this.edgeValues[e];
          sum += signal;
          const cell = groups[source] * GROUP_COUNT + target;
          if (signal > 0) flow[cell] += signal;
          else flow[GROUP_COUNT * GROUP_COUNT + cell] -= signal;
        }
        const drive = sum + this.bias[i] + input[i];
        b[i] = drive > 0 ? keep * a[i] + (alpha * drive) / (1 + drive) : keep * a[i];
      }
    }
    return { frames, flows, steps };
  }

  readout(activity: Float32Array): BrainOutput {
    const w = this.weights;
    for (let k = 0; k < w.readout.length; k++) this.features[k] = activity[w.readout[k]] * w.featureScale[k] + w.featureShift[k];
    linear(w.hiddenLayer, this.features, this.hidden);
    for (let i = 0; i < this.hidden.length; i++) this.hidden[i] = quickGelu(this.hidden[i]);
    linear(w.hiddenLayer2, this.hidden, this.hidden2);
    for (let i = 0; i < this.hidden.length; i++) this.hidden[i] += quickGelu(this.hidden2[i]); // residual second layer
    const policy = linear(w.policy, this.hidden, new Float32Array(MOVE_SPACE));
    const reply = linear(w.reply, this.hidden, new Float32Array(MOVE_SPACE));
    const value = new Float32Array(3);
    for (let r = 0; r < 3; r++) {
      let sum = w.valueBias[r];
      for (let i = 0; i < this.hidden.length; i++) sum += w.valueWeight[r * this.hidden.length + i] * this.hidden[i];
      value[r] = Math.tanh(sum);
    }
    const groups = new Float32Array(GROUP_COUNT);
    for (let i = 0; i < this.count; i++) groups[this.graph.groups[i]] += activity[i];
    for (let k = 0; k < GROUP_COUNT; k++) groups[k] /= Math.max(1, this.groupCounts[k]);
    return { policy, reply, value, groups };
  }

  evaluate(board: EncodedBoard): BrainOutput {
    return this.readout(this.propagate(this.encode(board)));
  }

  /** Interface neurons of the trained model, for the brain view. Readout wins where roles overlap. */
  roles(): Uint8Array {
    const roles = new Uint8Array(this.count);
    for (const i of this.weights.visIndex) roles[i] = ROLE_VISUAL;
    for (const i of this.weights.globIndex) roles[i] = ROLE_GLOBAL;
    for (const i of this.weights.readout) roles[i] = ROLE_READOUT;
    return roles;
  }

  /** Same result through an accelerator; `activity` is updated so the brain view stays in sync. */
  async evaluateWith(propagate: (input: Float32Array, steps: number) => Promise<Float32Array>, board: EncodedBoard): Promise<BrainOutput> {
    const activity = await propagate(this.encode(board), this.weights.steps);
    this.activity.set(activity);
    return this.readout(this.activity);
  }
}

/** x · sigmoid(1.702 x), the activation used in training. */
function quickGelu(x: number): number {
  return x / (1 + Math.exp(-1.702 * x));
}

function linear(layer: QuantisedLinear, input: Float32Array, out: Float32Array): Float32Array {
  const { weights, scale, bias, rows, inputs } = layer;
  for (let r = 0; r < rows; r++) {
    let sum = 0;
    const base = r * inputs;
    for (let i = 0; i < inputs; i++) sum += weights[base + i] * input[i];
    out[r] = sum * scale[r] + bias[r];
  }
  return out;
}

/** Combined scalar value in [-1, 1] used for planning: now, future and outcome heads. */
export function combinedValue(value: Float32Array): number {
  return 0.4 * value[0] + 0.35 * value[1] + 0.25 * value[2];
}
