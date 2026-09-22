/**
 * Trained weights of the Fly brain. Layout produced by flybrain/export_weights.py.
 */

import { GLOBAL_FEATURES, SQUARE_FEATURES } from "./encoding.ts";

export interface FlyModelManifest {
  version: number;
  label: string;
  bytes: number;
  compressedBytes: number;
  sha256: string;
  connectome: string;
  neurons: number;
  connections: number;
  visualInputs: number;
  globalInputs: number;
  readout: number;
  hidden: number;
  steps: number;
  squareFeatures: number;
  globalFeatures: number;
  moveSpace: number;
  training?: { step?: number; positions?: number };
}

export interface QuantisedLinear {
  /** int8 weights, output-major (rows × inputs). */
  weights: Int8Array;
  scale: Float32Array;
  bias: Float32Array;
  rows: number;
  inputs: number;
}

export class FlyWeights {
  readonly neurons: number;
  readonly edges: number;
  readonly steps: number;
  readonly hidden: number;
  readonly squareFeatures: number;
  readonly globalFeatures: number;
  readonly alpha: number;
  readonly kappa: number;
  readonly gainMax: number;
  readonly visIndex: Uint32Array;
  readonly visSquare: Uint8Array;
  readonly visWeight: Float32Array;
  readonly globIndex: Uint32Array;
  readonly globWeight: Float32Array;
  readonly bias: Float32Array;
  readonly gain: Uint8Array;
  readonly readout: Uint32Array;
  /** Folded batch norm: feature = activity * scale + shift. */
  readonly featureScale: Float32Array;
  readonly featureShift: Float32Array;
  readonly hiddenLayer: QuantisedLinear;
  readonly hiddenLayer2: QuantisedLinear;
  readonly policy: QuantisedLinear;
  readonly reply: QuantisedLinear;
  readonly valueWeight: Float32Array;
  readonly valueBias: Float32Array;

  readonly buffer: ArrayBuffer;

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    if (buffer.byteLength < 64) throw new Error("Weights file is truncated.");
    const header = new Uint32Array(buffer, 0, 12);
    if (header[0] !== 0x594c4643 || header[1] !== 1) throw new Error("Unknown weights format.");
    const [, , n, m, nVis, nGlob, p, h, f, g, t] = header;
    const constants = new Float32Array(buffer, 48, 4);
    this.neurons = n;
    this.edges = m;
    this.hidden = h;
    this.steps = t;
    this.squareFeatures = f;
    this.globalFeatures = g;
    this.alpha = constants[0];
    this.kappa = constants[1];
    this.gainMax = constants[2];
    if (!n || !m || !nVis || !p || !h || !t || t > 64 || f !== SQUARE_FEATURES || g !== GLOBAL_FEATURES) throw new Error("Weights header is invalid.");
    let cursor = 64;
    const pad = () => { cursor = Math.ceil(cursor / 4) * 4; };
    const need = (bytes: number) => { if (cursor + bytes > buffer.byteLength) throw new Error("Weights file is truncated."); };
    const u32 = (length: number) => { need(length * 4); const view = new Uint32Array(buffer, cursor, length); cursor += length * 4; return view; };
    const u8 = (length: number) => { need(length); const view = new Uint8Array(buffer, cursor, length); cursor += length; pad(); return view; };
    const i8 = (length: number) => { need(length); const view = new Int8Array(buffer, cursor, length); cursor += length; pad(); return view; };
    const f32 = (length: number) => { need(length * 4); const view = new Float32Array(buffer, cursor, length); cursor += length * 4; return view; };
    const f16 = (length: number) => { need(length * 2); const view = new Uint16Array(buffer, cursor, length); cursor += length * 2; pad(); return halfToFloat(view); };
    this.visIndex = u32(nVis);
    this.visSquare = u8(nVis);
    this.visWeight = f16(nVis * f);
    this.globIndex = u32(nGlob);
    this.globWeight = f16(nGlob * g);
    this.bias = f16(n);
    this.gain = u8(m);
    this.readout = u32(p);
    const linear = (rows: number, inputs: number): QuantisedLinear => ({ weights: i8(rows * inputs), scale: f32(rows), bias: f32(rows), rows, inputs });
    this.featureScale = f32(p);
    this.featureShift = f32(p);
    this.hiddenLayer = linear(h, p);
    this.hiddenLayer2 = linear(h, h);
    this.policy = linear(4096, h);
    this.reply = linear(4096, h);
    this.valueWeight = f32(3 * h);
    this.valueBias = f32(3);
    if (cursor !== buffer.byteLength) throw new Error("Weights file has trailing data.");
    for (const index of this.visIndex) if (index >= n) throw new Error("Visual input index out of range.");
    for (const index of this.globIndex) if (index >= n) throw new Error("Global input index out of range.");
    for (const index of this.readout) if (index >= n) throw new Error("Readout index out of range.");
    for (const square of this.visSquare) if (square > 63) throw new Error("Visual square out of range.");
  }
}

/** IEEE 754 binary16 → binary32, without relying on Float16Array support. */
export function halfToFloat(halves: Uint16Array): Float32Array {
  const out = new Float32Array(halves.length);
  for (let i = 0; i < halves.length; i++) {
    const h = halves[i];
    const sign = h & 0x8000 ? -1 : 1;
    const exponent = (h >> 10) & 0x1f;
    const mantissa = h & 0x3ff;
    if (exponent === 0) out[i] = sign * mantissa * 2 ** -24;
    else if (exponent === 31) out[i] = mantissa ? NaN : sign * Infinity;
    else out[i] = sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
  }
  return out;
}
