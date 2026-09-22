/**
 * MaleCNS v1.0 connectome loader. The binary format is produced by
 * flybrain/export_connectome.py and is byte-identical to the Super Mario
 * Flywire experiment (incoming CSR, uint16 synapse counts, modelled signs).
 */

export interface ConnectomeManifest {
  version: number;
  id: string;
  dataset: string;
  neurons: number;
  connections: number;
  synapses: number;
  positioned: number;
  bytes: number;
  compressedBytes: number;
  sha256: string;
  groups: string[];
  groupCounts: number[];
}

export class Connectome {
  readonly count: number;
  readonly edges: number;
  readonly ids: Uint32Array;
  readonly groups: Uint32Array;
  readonly signs: Float32Array;
  readonly positioned: Uint32Array;
  readonly positions: Float32Array;
  readonly offsets: Uint32Array;
  readonly sources: Uint32Array;
  readonly weights: Uint16Array;

  readonly buffer: ArrayBuffer;

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    if (buffer.byteLength < 16) throw new Error("Connectome file is truncated.");
    const header = new Uint32Array(buffer, 0, 4);
    if (header[0] !== 0x534e434d || header[1] !== 1) throw new Error("Unknown connectome format.");
    this.count = header[2];
    this.edges = header[3];
    const n = this.count;
    const m = this.edges;
    if (!n || buffer.byteLength !== 20 + n * 32 + m * 6) throw new Error("Connectome size does not match its header.");
    let cursor = 16;
    const uints = (length: number) => {
      const view = new Uint32Array(buffer, cursor, length);
      cursor += length * 4;
      return view;
    };
    const floats = (length: number) => {
      const view = new Float32Array(buffer, cursor, length);
      cursor += length * 4;
      return view;
    };
    this.ids = uints(n);
    this.groups = uints(n);
    this.signs = floats(n);
    this.positioned = uints(n);
    this.positions = floats(n * 3);
    this.offsets = uints(n + 1);
    this.sources = uints(m);
    this.weights = new Uint16Array(buffer, cursor, m);
    if (this.offsets[0] !== 0 || this.offsets[n] !== m) throw new Error("Connectome edge index is invalid.");
    for (let i = 0; i < n; i++) {
      if (this.groups[i] > 5 || Math.abs(this.signs[i]) !== 1 || this.offsets[i] > this.offsets[i + 1]) {
        throw new Error("Connectome neuron record is invalid.");
      }
    }
    for (let e = 0; e < m; e++) {
      if (this.sources[e] >= n || !this.weights[e]) throw new Error("Connectome edge record is invalid.");
    }
  }
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Accept gzip or an already-decompressed body (static hosts differ). */
export async function inflate(bytes: Uint8Array): Promise<ArrayBuffer> {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function fetchVerified(url: string, expectedSha: string, limit: number, progress?: (bytes: number) => void): Promise<ArrayBuffer> {
  // Revalidate instead of trusting a cached body: a retrained brain replaces the file under the same URL.
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok || !response.body) throw new Error(`Could not download ${url}.`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel();
      throw new Error(`${url} is larger than expected.`);
    }
    chunks.push(value);
    progress?.(received);
  }
  const joined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  const buffer = await inflate(joined);
  const hash = await sha256(buffer);
  if (hash !== expectedSha) throw new Error(`Checksum mismatch for ${url}.`);
  return buffer;
}

export async function loadConnectome(base: string, progress?: (label: string) => void): Promise<{ graph: Connectome; manifest: ConnectomeManifest }> {
  const response = await fetch(`${base}manifest.json`);
  if (!response.ok) throw new Error("Could not load the MaleCNS manifest.");
  const manifest: ConnectomeManifest = await response.json();
  if (manifest.version !== 1 || !Number.isSafeInteger(manifest.bytes) || manifest.bytes > 150_000_000 || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
    throw new Error("The MaleCNS manifest is invalid.");
  }
  const buffer = await fetchVerified(`${base}connectome.bin.gz`, manifest.sha256, 150_000_000, (bytes) =>
    progress?.(`Connectome · ${(bytes / 1e6).toFixed(1)} / ${(manifest.compressedBytes / 1e6).toFixed(1)} MB`),
  );
  const graph = new Connectome(buffer);
  if (graph.count !== manifest.neurons || graph.edges !== manifest.connections) throw new Error("The manifest does not describe this connectome.");
  return { graph, manifest };
}
