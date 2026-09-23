import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { FLOW_SIZE, FlyBrain, GROUP_COUNT, ROLE_GLOBAL, ROLE_READOUT, ROLE_VISUAL } from "./brain";
import { Connectome } from "./connectome";
import { encodeBoard, GLOBAL_FEATURES, SQUARE_FEATURES, squareIndex } from "./encoding";
import { buildConnectome, buildWeights } from "./test-helpers";
import { FlyWeights } from "./weights";

/** 0 (visual, sees e2) → 1 → 2 ; 3 (inhibitory) → 2 ; 4 senses the constant global feature. */
function circuit(inhibitorySign = -1) {
  const graph = new Connectome(buildConnectome({
    signs: [1, 1, 1, inhibitorySign, 1],
    groups: [0, 1, 3, 2, 5],
    edges: [[0, 1, 10], [1, 2, 5], [3, 2, 5]],
  }));
  const visWeight = new Array(SQUARE_FEATURES).fill(0);
  visWeight[0] = 1; // responds to an own pawn
  const globWeight = new Array(GLOBAL_FEATURES).fill(0);
  globWeight[8] = 0.5; // constant feature
  const weights = new FlyWeights(buildWeights({
    neurons: 5, edges: 3, steps: 4, hidden: 2,
    visIndex: [0], visSquare: [squareIndex("e2")], visWeight,
    globIndex: [4], globWeight,
    bias: [0, 0, 0, 0.8, 0], gain: [0, 0, 0], readout: [2, 1],
  }));
  return { graph, weights };
}

describe("fly brain inference", () => {
  it("rejects malformed weight files", () => {
    const { graph, weights } = circuit();
    expect(graph.ids[0]).toBe(720575940000000000n);
    expect(() => new FlyWeights(weights.buffer.slice(0, -4))).toThrow();
    const wrongMagic = weights.buffer.slice(0);
    new Uint32Array(wrongMagic, 0, 1)[0] = 1;
    expect(() => new FlyWeights(wrongMagic)).toThrow();
    const outOfRange = weights.buffer.slice(0);
    new Uint32Array(outOfRange, 64, 1)[0] = 99; // first visual index
    expect(() => new FlyWeights(outOfRange)).toThrow();
  });

  it("refuses weights trained on another connectome", () => {
    const { weights } = circuit();
    const other = new Connectome(buildConnectome({ signs: [1, 1], groups: [0, 2], edges: [[0, 1, 5]] }));
    expect(() => new FlyBrain(other, weights)).toThrow();
  });

  it("drives visual neurons from their own square only and follows real edges step by step", () => {
    const { graph, weights } = circuit();
    const brain = new FlyBrain(graph, weights);
    const input = brain.encode(encodeBoard(new Chess()));
    expect(input[0]).toBeCloseTo(1, 3); // own pawn on e2
    expect(input[4]).toBeCloseTo(0.5, 3); // constant global feature
    expect(input[1]).toBe(0);

    const one = brain.propagate(input, 1).slice();
    // a0 = alpha * drive / (1 + drive) with drive = 1
    expect(one[0]).toBeCloseTo(0.65 * 0.5, 5);
    expect(one[1]).toBe(0); // activity needs a step to cross a synapse
    const two = brain.propagate(input, 2).slice();
    expect(two[1]).toBeGreaterThan(0);
    expect(two[2]).toBe(0);

    // Without the visual stimulus nothing downstream of neuron 0 activates.
    const empty = encodeBoard(new Chess("8/8/8/8/8/8/8/k6K w - - 0 1"));
    const dark = brain.propagate(brain.encode(empty), 4);
    expect(dark[0]).toBe(0);
    expect(dark[1]).toBe(0);
  });

  it("applies transmitter signs: an inhibitory input silences its target", () => {
    const excitatory = circuit(1);
    const inhibitory = circuit(-1);
    const board = encodeBoard(new Chess());
    const a = new FlyBrain(excitatory.graph, excitatory.weights);
    const b = new FlyBrain(inhibitory.graph, inhibitory.weights);
    const withExcitation = a.propagate(a.encode(board), 4)[2];
    const withInhibition = b.propagate(b.encode(board), 4)[2];
    expect(withExcitation).toBeGreaterThan(0.05);
    expect(withInhibition).toBeLessThan(withExcitation);
  });

  it("scales a connection by its trained gain", () => {
    const base = circuit();
    const boosted = circuit();
    boosted.weights.gain[0] = 2; // exp(2) on the 0 → 1 edge
    // Normalisation uses measured counts only, so a larger gain is a genuinely stronger synapse.
    const board = encodeBoard(new Chess());
    const a = new FlyBrain(base.graph, base.weights);
    const b = new FlyBrain(boosted.graph, boosted.weights);
    expect(b.propagate(b.encode(board), 3)[1]).toBeGreaterThan(a.propagate(a.encode(board), 3)[1]);
  });

  it("reads policy, reply and bounded values from the selected electrodes", () => {
    const { graph, weights } = circuit();
    // hidden unit 0 listens to electrode 1 (neuron 1, excited by the visual neuron); policy logit 7 listens to hidden unit 0.
    weights.hiddenLayer.weights[1] = 127;
    weights.policy.weights[7 * 2] = 127;
    weights.valueWeight[0] = 50;
    const brain = new FlyBrain(graph, weights);
    const output = brain.evaluate(encodeBoard(new Chess()));
    expect(output.policy.length).toBe(4168);
    expect(output.policy[7]).toBeGreaterThan(output.policy[8]);
    expect(output.value[0]).toBeGreaterThan(0);
    expect(output.value[0]).toBeLessThanOrEqual(1);
    expect(output.groups.length).toBe(6);
    expect(output.groups[0]).toBeGreaterThan(0);
  });
  it("records every propagation step for the brain view without changing the result", () => {
    const { graph, weights } = circuit();
    const brain = new FlyBrain(graph, weights);
    const input = brain.encode(encodeBoard(new Chess()));
    const trace = brain.trace(input.slice());
    const final = brain.propagate(input).slice();
    expect(trace.steps).toBe(4);
    expect(trace.frames.length).toBe(5 * 5);
    expect(Array.from(trace.frames.subarray(0, 5))).toEqual([0, 0, 0, 0, 0]);
    expect(Array.from(trace.frames.subarray(4 * 5))).toEqual(Array.from(final));
    // Step 2: neuron 0 (group 0) excites 1 (group 1); inhibitory 3 (group 2) suppresses 2 (group 3).
    const flow = trace.flows.subarray(FLOW_SIZE, 2 * FLOW_SIZE);
    const excitatory = (from: number, to: number) => flow[from * GROUP_COUNT + to];
    const inhibitory = (from: number, to: number) => flow[GROUP_COUNT * GROUP_COUNT + from * GROUP_COUNT + to];
    expect(excitatory(0, 1)).toBeGreaterThan(0);
    expect(inhibitory(2, 3)).toBeGreaterThan(0);
    expect(excitatory(2, 3)).toBe(0);
    expect(Array.from(trace.flows.subarray(0, FLOW_SIZE)).every((v) => v === 0)).toBe(true); // nothing fires at rest
    expect(Array.from(brain.roles())).toEqual([ROLE_VISUAL, ROLE_READOUT, ROLE_READOUT, 0, ROLE_GLOBAL]);
  });
});
