/**
 * Playback clock for the brain views. A thought is recorded as 10 propagation
 * steps (FlyBrain.trace); every view draws the same continuous time t ∈ [0, steps],
 * so the 3-D cloud, the flow diagram and the timeline always show one moment.
 *
 * While the fly is thinking the recording loops; once it has moved it plays once
 * and holds the final state. Scrubbing pauses it. A single requestAnimationFrame
 * loop runs only while at least one view is mounted.
 */

import { useFlyStore, type FlyTrace } from "@/state/fly";
import { analyseTrace, type TraceStats } from "./stats";

export type PlayMode = "loop" | "once" | "paused";
type Listener = (t: number, now: number) => void;

const STEPS_PER_SECOND = 3.2;
const HOLD_SECONDS = 1.1;

class BrainClock {
  t = 0;
  mode: PlayMode = "paused";
  trace: FlyTrace | null = null;
  stats: TraceStats | null = null;
  /** Bumped whenever the trace changes, so views know to re-upload data. */
  version = 0;
  private hold = 0;
  private last = 0;
  private frame = 0;
  private listeners = new Set<Listener>();
  private reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  get steps(): number {
    return this.trace?.steps ?? 10;
  }

  setTrace(trace: FlyTrace | null, thinking: boolean): void {
    this.trace = trace;
    this.stats = trace ? analyseTrace(trace) : null;
    this.version++;
    this.hold = 0;
    if (!trace) {
      this.t = 0;
      this.mode = "paused";
    } else if (this.reduced) {
      this.t = trace.steps;
      this.mode = "paused";
    } else {
      this.t = 0;
      this.mode = thinking ? "loop" : "once";
    }
    this.kick();
  }

  /** The fly finished thinking: let the current pass finish and hold the result. */
  settle(): void {
    if (this.mode === "loop") this.mode = "once";
  }

  seek(t: number): void {
    this.t = Math.max(0, Math.min(this.steps, t));
    this.mode = "paused";
    this.kick();
  }

  play(): void {
    if (!this.trace) return;
    if (this.t >= this.steps - 1e-3) this.t = 0;
    this.hold = 0;
    this.mode = "once";
    this.kick();
  }

  pause(): void {
    this.mode = "paused";
    this.kick();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.kick();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
      }
    };
  }

  private kick(): void {
    if (!this.frame && this.listeners.size) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number): void => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.mode !== "paused" && this.trace) {
      if (this.t < this.steps) this.t = Math.min(this.steps, this.t + dt * STEPS_PER_SECOND);
      else if (this.mode === "loop") {
        this.hold += dt;
        if (this.hold > HOLD_SECONDS) {
          this.hold = 0;
          this.t = 0;
        }
      } else this.mode = "paused";
    }
    for (const listener of this.listeners) listener(this.t, now);
    // Views animate (rotation, particles) even when time stands still.
    this.frame = this.listeners.size ? requestAnimationFrame(this.tick) : 0;
  };
}

export const brainClock = new BrainClock();

// Follow the fly: a new recording starts the playback, the end of thinking settles it.
useFlyStore.subscribe((state, previous) => {
  if (state.trace !== previous.trace) brainClock.setTrace(state.trace, state.status === "thinking");
  if (previous.status === "thinking" && state.status !== "thinking") brainClock.settle();
});

/** Smooth step between recorded frames. */
export function frameBlend(t: number, steps: number): { k: number; f: number } {
  const clamped = Math.max(0, Math.min(steps, t));
  const k = Math.min(steps - 1, Math.floor(clamped));
  const f = clamped - k;
  return { k, f: f * f * (3 - 2 * f) };
}
