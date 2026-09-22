/**
 * Owns the connectome and the trained weights; all inference runs off the main thread.
 */

import { Chess } from "chess.js";
import { FlyBrain, type BrainOutput } from "./brain.ts";
import { Connectome } from "./connectome.ts";
import { encodeBoard, type EncodedBoard } from "./encoding.ts";
import { GpuPropagator } from "./gpu.ts";
import { plan, THINKING_STAGES, type Widths } from "./planner.ts";
import type { FlyCommand, FlyReply } from "./protocol";
import { FlyWeights } from "./weights.ts";

const scope = globalThis as unknown as {
  postMessage(message: FlyReply, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<FlyCommand>) => void) | null;
};

const CPU_STAGES: readonly Widths[] = [[3, 1], [3, 2], [4, 3], [6, 4], [8, 5]];

let brain: FlyBrain | null = null;
let gpu: GpuPropagator | null = null;
/** Kept so another model can be loaded on the same wiring without sending it again. */
let graph: Connectome | null = null;
let preferGpu = false;

/** A brain for these weights, on the GPU when possible. Returns why the GPU was not used, if it was not. */
async function buildBrain(weights: FlyWeights): Promise<string | undefined> {
  gpu?.dispose();
  gpu = null;
  brain = new FlyBrain(graph!, weights);
  if (!preferGpu) return undefined;
  try {
    gpu = await GpuPropagator.create(brain);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
// One evaluation at a time: GPU buffers and the brain's scratch arrays are shared.
let queue: Promise<void> = Promise.resolve();

/** What the fly sees: the 64 × 14 board stimulus (piece channels + attack maps), mover frame. */
function retinaOf(chess: Chess): Float32Array {
  return encodeBoard(chess).squares.slice();
}

async function evaluate(activeBrain: FlyBrain, board: EncodedBoard): Promise<BrainOutput> {
  if (gpu) {
    const accelerator = gpu;
    try {
      return await activeBrain.evaluateWith((input, steps) => accelerator.propagate(input, steps), board);
    } catch (error) {
      // Device loss or a driver fault: finish this and all later thoughts on the CPU.
      console.warn("Fly brain: GPU failed, continuing on the CPU.", error);
      accelerator.dispose();
      gpu = null;
    }
  }
  return activeBrain.evaluate(board);
}

async function handle(command: FlyCommand): Promise<void> {
  try {
    if (command.type === "init") {
      const started = performance.now();
      graph = new Connectome(command.graph);
      preferGpu = command.preferGpu;
      const reason = await buildBrain(new FlyWeights(command.weights));
      const roles = brain!.roles();
      scope.postMessage({ type: "ready", neurons: graph.count, connections: graph.edges, buildMs: performance.now() - started,
        backend: gpu ? "webgpu" : "cpu", adapter: gpu?.adapterName ?? "CPU", reason, roles }, [roles.buffer]);
      return;
    }
    if (!brain || !graph) throw new Error("The fly brain is not loaded yet.");
    if (command.type === "weights") {
      await buildBrain(new FlyWeights(command.weights));
      const roles = brain.roles();
      scope.postMessage({ type: "model", id: command.id, backend: gpu ? "webgpu" : "cpu", adapter: gpu?.adapterName ?? "CPU", roles }, [roles.buffer]);
      return;
    }
    const activeBrain = brain;
    if (command.type === "trace") {
      const started = performance.now();
      const trace = activeBrain.trace(activeBrain.encode(encodeBoard(new Chess(command.fen))));
      scope.postMessage({ type: "trace", id: command.id, frames: trace.frames, flows: trace.flows, steps: trace.steps,
        traceMs: performance.now() - started }, [trace.frames.buffer, trace.flows.buffer]);
      return;
    }
    const chess = new Chess(command.fen);
    if (command.wantActivity) {
      // The brain view replays how the board spreads through the connectome, step by step. Recorded on
      // the CPU for every backend, before the thinking clock starts, so it never eats thinking time.
      const traceStarted = performance.now();
      const trace = activeBrain.trace(activeBrain.encode(encodeBoard(chess)));
      scope.postMessage({ type: "trace", id: command.id, frames: trace.frames, flows: trace.flows, steps: trace.steps,
        traceMs: performance.now() - traceStarted }, [trace.frames.buffer, trace.flows.buffer]);
    }
    const started = performance.now();
    // The first evaluation is the root position: keep its activity for the brain view.
    let activity: Float32Array | undefined;
    // Thinking: deeper and wider stages until the budget is spent. An evaluation costs ~5x more on
    // the CPU, so its first stage is lighter; each completed stage is reported to the panel.
    const decision = await plan(chess, async (board) => {
      const output = await evaluate(activeBrain, board);
      if (command.wantActivity && !activity) activity = activeBrain.activity.slice();
      return output;
    }, {
      ...command.options,
      stages: gpu ? THINKING_STAGES : CPU_STAGES,
      onStage: (soFar) => scope.postMessage({ type: "progress", id: command.id, decision: soFar, elapsedMs: performance.now() - started }),
    });
    const retina = retinaOf(chess);
    const reply: FlyReply = { type: "decision", id: command.id, decision, thinkMs: performance.now() - started, activity, retina, backend: gpu ? "webgpu" : "cpu" };
    scope.postMessage(reply, activity ? [activity.buffer, retina.buffer] : [retina.buffer]);
  } catch (error) {
    scope.postMessage({ type: "error", id: command.type === "init" ? undefined : command.id, message: error instanceof Error ? error.message : String(error) });
  }
}

scope.onmessage = ({ data: command }) => {
  queue = queue.then(() => handle(command));
};
