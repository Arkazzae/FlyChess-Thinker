/**
 * Summaries of a recorded thought, computed once when it arrives: mean activity of
 * every anatomical group per step, how much of the read-out lives in each group,
 * a robust brightness scale for the point cloud and the strongest group-to-group flow.
 */

import { GROUP_COUNT, ROLE_READOUT } from "@/ai/fly/brain";
import type { FlyTrace } from "@/state/fly";
import { useFlyStore } from "@/state/fly";

export interface TraceStats {
  /** (steps + 1) × 6 mean activity per group. */
  groupMean: Float32Array;
  /** (steps + 1) × 6 summed activity of read-out neurons per group (what the decision layer receives). */
  readout: Float32Array;
  /** Per frame, the 99.5th percentile activity (brightness normalisation for the cloud). */
  scale: Float32Array;
  /** Largest single excitatory or inhibitory cell over all steps. */
  flowMax: number;
  /** Largest group mean over all frames. */
  meanMax: number;
  readoutMax: number;
  /** Group that changed the most at each step: where the wave is. */
  front: Uint8Array;
}

export function analyseTrace(trace: FlyTrace): TraceStats {
  const anatomy = useFlyStore.getState().anatomy;
  const roles = useFlyStore.getState().roles;
  const frames = trace.steps + 1;
  const n = trace.frames.length / frames;
  const groupMean = new Float32Array(frames * GROUP_COUNT);
  const readout = new Float32Array(frames * GROUP_COUNT);
  const scale = new Float32Array(frames);
  const counts = new Float32Array(GROUP_COUNT);
  const groups = anatomy?.groups;
  if (groups) for (let i = 0; i < n; i++) counts[groups[i]]++;
  const sample = new Float32Array(Math.ceil(n / 13));
  for (let f = 0; f < frames; f++) {
    const frame = trace.frames.subarray(f * n, (f + 1) * n);
    if (groups) {
      for (let i = 0; i < n; i++) {
        const g = groups[i];
        groupMean[f * GROUP_COUNT + g] += frame[i];
        if (roles && roles[i] === ROLE_READOUT) readout[f * GROUP_COUNT + g] += frame[i];
      }
      for (let g = 0; g < GROUP_COUNT; g++) groupMean[f * GROUP_COUNT + g] /= Math.max(1, counts[g]);
    }
    for (let i = 0, j = 0; i < n; i += 13, j++) sample[j] = frame[i];
    const sorted = sample.slice().sort();
    scale[f] = Math.max(1e-4, sorted[Math.floor(sorted.length * 0.995)]);
  }
  let flowMax = 1e-9;
  for (let i = 0; i < trace.flows.length; i++) flowMax = Math.max(flowMax, trace.flows[i]);
  let meanMax = 1e-9;
  for (const v of groupMean) meanMax = Math.max(meanMax, v);
  let readoutMax = 1e-9;
  for (const v of readout) readoutMax = Math.max(readoutMax, v);
  const front = new Uint8Array(frames);
  for (let f = 1; f < frames; f++) {
    let best = 0;
    let bestRise = -Infinity;
    for (let g = 0; g < GROUP_COUNT; g++) {
      const rise = (groupMean[f * GROUP_COUNT + g] - groupMean[(f - 1) * GROUP_COUNT + g]) / Math.max(1e-6, meanMax);
      if (rise > bestRise) { bestRise = rise; best = g; }
    }
    front[f] = best;
  }
  return { groupMean, readout, scale, flowMax, meanMax, readoutMax, front };
}

/** Linear interpolation of a per-frame table (rows of `width`) at time t. */
export function sampleRow(table: Float32Array, width: number, t: number, frames: number, out = new Float32Array(width)): Float32Array {
  const clamped = Math.max(0, Math.min(frames - 1, t));
  const k = Math.min(frames - 2, Math.floor(clamped));
  const f = clamped - k;
  for (let i = 0; i < width; i++) out[i] = table[k * width + i] * (1 - f) + table[(k + 1) * width + i] * f;
  return out;
}
