/** Builders for tiny synthetic connectomes and weight files, used only by tests. */

import { GLOBAL_FEATURES, SQUARE_FEATURES } from "./encoding";

export interface TinyGraphSpec {
  signs: number[];
  groups: number[];
  /** Directed edges as [source, target, synapses]. */
  edges: [number, number, number][];
}

export function buildConnectome(spec: TinyGraphSpec): ArrayBuffer {
  const n = spec.signs.length;
  const edges = [...spec.edges].sort((a, b) => a[1] - b[1]);
  const m = edges.length;
  const buffer = new ArrayBuffer(20 + n * 32 + m * 6);
  let offset = 0;
  const put = (values: number[], float = false) => {
    const view = float ? new Float32Array(buffer, offset, values.length) : new Uint32Array(buffer, offset, values.length);
    view.set(values);
    offset += values.length * 4;
  };
  put([0x534e434d, 1, n, m]);
  put(Array.from({ length: n }, (_, i) => 1000 + i));
  put(spec.groups);
  put(spec.signs, true);
  put(new Array(n).fill(1));
  put(new Array(n * 3).fill(0), true);
  const offsets = new Array(n + 1).fill(0);
  for (const [, target] of edges) offsets[target + 1]++;
  for (let i = 0; i < n; i++) offsets[i + 1] += offsets[i];
  put(offsets);
  put(edges.map((e) => e[0]));
  new Uint16Array(buffer, offset, m).set(edges.map((e) => e[2]));
  return buffer;
}

function floatToHalf(value: number): number {
  const floatView = new Float32Array([value]);
  const bits = new Uint32Array(floatView.buffer)[0];
  const sign = (bits >> 16) & 0x8000;
  const exponent = ((bits >> 23) & 0xff) - 127 + 15;
  const mantissa = bits & 0x7fffff;
  if (exponent <= 0) return sign;
  if (exponent >= 31) return sign | 0x7c00;
  return sign | (exponent << 10) | (mantissa >> 13);
}

export interface TinyWeightsSpec {
  neurons: number;
  edges: number;
  steps: number;
  hidden: number;
  visIndex: number[];
  visSquare: number[];
  /** visIndex.length × 14 */
  visWeight: number[];
  globIndex: number[];
  /** globIndex.length × 9 */
  globWeight: number[];
  bias: number[];
  /** Quantised log gains, 128 ≈ neutral. */
  gain: number[];
  gainMax: number;
  readout: number[];
  alpha?: number;
  kappa?: number;
}

/** Readout layers are zero except what a test patches in afterwards through the parsed views. */
export function buildWeights(spec: TinyWeightsSpec): ArrayBuffer {
  const parts: Uint8Array[] = [];
  const pad4 = (bytes: Uint8Array) => {
    const out = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
    out.set(bytes);
    return out;
  };
  const u32 = (values: number[]) => new Uint8Array(new Uint32Array(values).buffer);
  const f32 = (values: number[]) => new Uint8Array(new Float32Array(values).buffer);
  const f16 = (values: number[]) => pad4(new Uint8Array(new Uint16Array(values.map(floatToHalf)).buffer));
  const p = spec.readout.length;
  const h = spec.hidden;
  parts.push(u32([0x594c4643, 1, spec.neurons, spec.edges, spec.visIndex.length, spec.globIndex.length, p, h, SQUARE_FEATURES, GLOBAL_FEATURES, spec.steps, 0]));
  parts.push(f32([spec.alpha ?? 0.65, spec.kappa ?? 0.95, spec.gainMax, 0]));
  parts.push(u32(spec.visIndex), pad4(new Uint8Array(spec.visSquare)), f16(spec.visWeight));
  parts.push(u32(spec.globIndex), f16(spec.globWeight), f16(spec.bias), pad4(new Uint8Array(spec.gain)), u32(spec.readout));
  parts.push(f32(new Array(p).fill(1)), f32(new Array(p).fill(0)));
  const linear = (rows: number, inputs: number) => [pad4(new Uint8Array(rows * inputs)), f32(new Array(rows).fill(1)), f32(new Array(rows).fill(0))];
  parts.push(...linear(h, p), ...linear(h, h), ...linear(4096, h), ...linear(4096, h));
  parts.push(f32(new Array(3 * h).fill(0)), f32([0, 0, 0]));
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out.buffer;
}
