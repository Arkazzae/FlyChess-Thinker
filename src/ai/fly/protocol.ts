import type { FlyDecision, PlanOptions } from "./planner";

export type FlyCommand =
  | { type: "init"; graph: ArrayBuffer; weights: ArrayBuffer; preferGpu: boolean }
  | { type: "think"; id: number; fen: string; options: PlanOptions; wantActivity: boolean }
  /** Record the propagation for a position without thinking about it (game replay). */
  | { type: "trace"; id: number; fen: string };

/** Plan options that can cross the worker boundary (no callbacks). */
export type PlainPlanOptions = Omit<PlanOptions, "random" | "onStage" | "now" | "stages">; // `seen` and `forcing` are plain data

export type FlyReply =
  | { type: "ready"; neurons: number; connections: number; buildMs: number; backend: "webgpu" | "cpu"; adapter: string; reason?: string; roles: Uint8Array }
  | { type: "progress"; id: number; decision: FlyDecision; elapsedMs: number }
  /** Step-by-step activity of the position the fly is looking at, sent before it starts thinking. */
  | { type: "trace"; id: number; frames: Float32Array; flows: Float32Array; steps: number; traceMs: number }
  | { type: "decision"; id: number; decision: FlyDecision; thinkMs: number; activity?: Float32Array; retina: Float32Array; backend: "webgpu" | "cpu" }
  | { type: "error"; id?: number; message: string };
