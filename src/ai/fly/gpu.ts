/**
 * WebGPU propagation for the Fly brain. The folded edge values are uploaded
 * once; every evaluation uploads the per-neuron drive (bias + board input),
 * runs all recurrent steps in one submission with two ping-pong buffers and
 * reads the final activity back. Any failure hands control back to the CPU
 * path in brain.ts, which computes the same numbers.
 */

import type { FlyBrain } from "./brain.ts";

export interface GpuStatus {
  backend: "webgpu" | "cpu";
  adapter: string;
  reason?: string;
}

const WORKGROUP = 64;

function shader(count: number, alpha: number): string {
  return `
@group(0) @binding(0) var<storage, read> offsets: array<u32>;
@group(0) @binding(1) var<storage, read> sources: array<u32>;
@group(0) @binding(2) var<storage, read> values: array<f32>;
@group(0) @binding(3) var<storage, read> drive: array<f32>;
@group(0) @binding(4) var<storage, read> previous: array<f32>;
@group(0) @binding(5) var<storage, read_write> next: array<f32>;
@compute @workgroup_size(${WORKGROUP})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= ${count}u) { return; }
  var sum = 0.0;
  for (var e = offsets[i]; e < offsets[i + 1u]; e++) {
    sum += previous[sources[e]] * values[e];
  }
  let d = sum + drive[i];
  var a = ${(1 - alpha).toFixed(8)} * previous[i];
  if (d > 0.0) { a += ${alpha.toFixed(8)} * d / (1.0 + d); }
  next[i] = a;
}`;
}

async function withDeadline<T>(pending: Promise<T>, label: string, ms = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out: ${label}.`)), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export class GpuPropagator {
  private fault = "";
  private buffers: GPUBuffer[] = [];
  private drive!: GPUBuffer;
  private ping!: GPUBuffer;
  private pong!: GPUBuffer;
  private readback!: GPUBuffer;
  private pipeline!: GPUComputePipeline;
  private groups!: [GPUBindGroup, GPUBindGroup];
  private readonly zeros: Float32Array;
  private readonly scratch: Float32Array;
  private readonly bytes: number;

  private readonly device: GPUDevice;
  private readonly brain: FlyBrain;
  readonly adapterName: string;

  private constructor(device: GPUDevice, brain: FlyBrain, adapterName: string) {
    this.device = device;
    this.brain = brain;
    this.adapterName = adapterName;
    this.bytes = brain.count * 4;
    this.zeros = new Float32Array(brain.count);
    this.scratch = new Float32Array(brain.count);
    void device.lost.then((info) => { this.fault = info.message || "The GPU device was lost."; });
    device.addEventListener("uncapturederror", (event) => {
      event.preventDefault();
      this.fault = (event as GPUUncapturedErrorEvent).error.message;
    });
  }

  static async create(brain: FlyBrain, gpu: GPU | null | undefined = (globalThis.navigator as Navigator | undefined)?.gpu): Promise<GpuPropagator> {
    if (!gpu) throw new Error("WebGPU is not available in this browser or context.");
    const adapter = await withDeadline(gpu.requestAdapter({ powerPreference: "high-performance" }), "GPU adapter");
    if (!adapter) throw new Error("The browser did not provide a GPU adapter.");
    const info = adapter.info;
    if (info.isFallbackAdapter || /swiftshader|llvmpipe|software/i.test(`${info.description} ${info.architecture}`)) {
      throw new Error("Only a software WebGPU adapter is available.");
    }
    const largest = brain.graph.edges * 4;
    if (largest > adapter.limits.maxStorageBufferBindingSize || largest > adapter.limits.maxBufferSize ||
        Math.ceil(brain.count / WORKGROUP) > adapter.limits.maxComputeWorkgroupsPerDimension || adapter.limits.maxStorageBuffersPerShaderStage < 6) {
      throw new Error("GPU limits are too small for this connectome.");
    }
    const device = await withDeadline(adapter.requestDevice({ label: "Fly chess brain", requiredLimits: { maxStorageBufferBindingSize: Math.max(134217728, largest) } }), "GPU device");
    const propagator = new GpuPropagator(device, brain, info.description || [info.vendor, info.architecture].filter(Boolean).join(" ") || "WebGPU");
    try {
      await propagator.initialise();
      return propagator;
    } catch (error) {
      propagator.dispose();
      throw error;
    }
  }

  private buffer(label: string, size: number, usage: GPUBufferUsageFlags, initial?: ArrayBufferView): GPUBuffer {
    const buffer = this.device.createBuffer({ label, size: Math.max(4, Math.ceil(size / 4) * 4), usage, mappedAtCreation: !!initial });
    this.buffers.push(buffer);
    if (initial) {
      new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(initial.buffer, initial.byteOffset, initial.byteLength));
      buffer.unmap();
    }
    return buffer;
  }

  private async initialise(): Promise<void> {
    const { device, brain } = this;
    const graph = brain.graph;
    device.pushErrorScope("out-of-memory");
    device.pushErrorScope("validation");
    const fixed = GPUBufferUsage.STORAGE;
    const offsets = this.buffer("Incoming edge offsets", graph.offsets.byteLength, fixed, graph.offsets);
    const sources = this.buffer("Presynaptic indices", graph.sources.byteLength, fixed, graph.sources);
    const values = this.buffer("Trained synaptic values", brain.edgeValues.byteLength, fixed, brain.edgeValues);
    this.drive = this.buffer("Bias and board input", this.bytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    this.ping = this.buffer("Activity A", this.bytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC);
    this.pong = this.buffer("Activity B", this.bytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    this.readback = this.buffer("Final activity", this.bytes, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
    this.pipeline = await withDeadline(device.createComputePipelineAsync({
      label: "Propagate connectome", layout: "auto",
      compute: { module: device.createShaderModule({ code: shader(brain.count, brain.weights.alpha) }), entryPoint: "main" },
    }), "GPU pipeline");
    const group = (previous: GPUBuffer, next: GPUBuffer) => device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [offsets, sources, values, this.drive, previous, next].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    this.groups = [group(this.ping, this.pong), group(this.pong, this.ping)];
    const validation = await withDeadline(device.popErrorScope(), "GPU validation");
    const memory = await withDeadline(device.popErrorScope(), "GPU allocation");
    if (validation || memory || this.fault) throw new Error(validation?.message || memory?.message || this.fault);
  }

  /** input: external drive per neuron (board stimulus); returns the final activity. */
  async propagate(input: Float32Array, steps: number): Promise<Float32Array> {
    if (this.fault) throw new Error(this.fault);
    const { device, brain } = this;
    for (let i = 0; i < brain.count; i++) this.scratch[i] = input[i] + brain.bias[i];
    device.pushErrorScope("validation");
    device.queue.writeBuffer(this.drive, 0, this.scratch.buffer as ArrayBuffer, 0, this.bytes);
    device.queue.writeBuffer(this.ping, 0, this.zeros.buffer as ArrayBuffer, 0, this.bytes);
    const encoder = device.createCommandEncoder({ label: "Fly brain evaluation" });
    const workgroups = Math.ceil(brain.count / WORKGROUP);
    for (let step = 0; step < steps; step++) {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.groups[step % 2]);
      pass.dispatchWorkgroups(workgroups);
      pass.end();
    }
    encoder.copyBufferToBuffer(steps % 2 === 1 ? this.pong : this.ping, 0, this.readback, 0, this.bytes);
    device.queue.submit([encoder.finish()]);
    let result: Float32Array;
    try {
      await withDeadline(this.readback.mapAsync(GPUMapMode.READ, 0, this.bytes), "GPU readback");
      result = new Float32Array(this.readback.getMappedRange(0, this.bytes)).slice();
    } finally {
      if (this.readback.mapState === "mapped") this.readback.unmap();
    }
    const error = await withDeadline(device.popErrorScope(), "GPU step check");
    if (error || this.fault) throw new Error(error?.message || this.fault);
    for (let i = 0; i < result.length; i += 997) if (!Number.isFinite(result[i])) throw new Error("The GPU returned invalid values.");
    return result;
  }

  dispose(): void {
    this.fault = "The GPU device was closed.";
    for (const buffer of this.buffers) buffer.destroy();
    this.buffers = [];
    this.device.destroy();
  }
}
