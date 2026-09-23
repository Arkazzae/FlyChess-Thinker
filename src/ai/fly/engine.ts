/**
 * Main-thread facade for the Fly brain worker. One instance is shared for the
 * whole session: the connectome (21 MB) and weights are downloaded and
 * verified once, then every game reuses the same worker.
 */

import { Connectome, fetchVerified, type ConnectomeManifest } from "./connectome";
import { DEFAULT_PLAN, type FlyDecision, type PlanOptions } from "./planner";
import type { FlyCommand, FlyReply } from "./protocol";
import type { FlyModelManifest } from "./weights";
import { useFlyStore } from "@/state/fly";

export interface FlyThinkResult {
  decision: FlyDecision;
  thinkMs: number;
}

interface Pending {
  resolve: (result: FlyThinkResult) => void;
  reject: (error: Error) => void;
  fen: string;
  /** A hint for the player: computed by the same brain, but the brain view keeps showing the fly's own thought. */
  silent: boolean;
}

const dataUrl = (path: string) => new URL(`./data/${path}`, document.baseURI).href;

/** Trained models the app can play, all on the same FlyWire v783 connectome. */
export type FlyModelId = "droso-1";
const DEFAULT_MODEL: FlyModelId = "droso-1";

export class FlyEngine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private pending = new Map<number, Pending>();
  private traces = new Map<number, string>();
  private nextId = 1;

  init(): Promise<void> {
    if (!this.ready) {
      this.ready = this.load().catch((error) => {
        this.ready = null;
        const message = error instanceof Error ? error.message : String(error);
        useFlyStore.getState().setError(message);
        throw error;
      });
    }
    return this.ready;
  }

  private async load(): Promise<void> {
    const store = useFlyStore.getState();
    store.setStatus("loading", "model");
    const fresh: RequestInit = { cache: "no-cache" };
    const [modelResponse, manifestResponse] = await Promise.all([fetch(dataUrl("droso-1/model.json"), fresh), fetch(dataUrl("flywire/manifest.json"), fresh)]);
    if (!modelResponse.ok) throw new Error("The trained fly brain is missing from this build.");
    if (!manifestResponse.ok) throw new Error("The FlyWire v783 manifest is missing from this build.");
    const model: FlyModelManifest = await modelResponse.json();
    const manifest: ConnectomeManifest = await manifestResponse.json();
    if (model.version !== 2 || !/^[a-f0-9]{64}$/.test(model.sha256) || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error("The fly brain manifest is invalid.");
    if (model.connectome !== manifest.sha256) throw new Error("The weights were trained on a different connectome.");

    const mb = (bytes: number) => (bytes / 1e6).toFixed(1);
    const total = manifest.compressedBytes + model.compressedBytes;
    const { setDownload } = useFlyStore.getState();
    setDownload({ stage: "connectome", loaded: 0, total });
    const graphBuffer = await fetchVerified(dataUrl("flywire/connectome.bin.gz"), manifest.sha256, 150_000_000, (bytes) => {
      useFlyStore.getState().setStatus("loading", `connectome ${mb(bytes)} / ${mb(manifest.compressedBytes)} MB`);
      setDownload({ stage: "connectome", loaded: Math.min(bytes, manifest.compressedBytes), total });
    });
    setDownload({ stage: "weights", loaded: manifest.compressedBytes, total });
    const weightsBuffer = await fetchVerified(dataUrl("droso-1/weights.bin.gz"), model.sha256, 150_000_000, (bytes) => {
      useFlyStore.getState().setStatus("loading", `weights ${mb(bytes)} / ${mb(model.compressedBytes)} MB`);
      setDownload({ stage: "weights", loaded: manifest.compressedBytes + Math.min(bytes, model.compressedBytes), total });
    });

    // Anatomy for the brain view is copied before the buffers move to the worker.
    const graph = new Connectome(graphBuffer);
    useFlyStore.getState().setAnatomy({
      neurons: graph.count, connections: graph.edges, groups: graph.groups.slice(), positions: graph.positions.slice(),
      positioned: graph.positioned.slice(), groupNames: manifest.groups, trainedPositions: model.training?.positions ?? null, label: model.label,
    });

    useFlyStore.getState().setStatus("loading", "wiring");
    setDownload({ stage: "wiring", loaded: total, total });
    const worker = new Worker(new URL("./fly.worker.ts", import.meta.url), { type: "module" });
    this.worker = worker;
    await new Promise<void>((resolve, reject) => {
      worker.onmessage = ({ data }: MessageEvent<FlyReply>) => {
        if (data.type === "ready") {
          useFlyStore.getState().setRoles(data.roles);
          useFlyStore.getState().setBackend({ backend: data.backend, adapter: data.adapter, reason: data.reason });
          resolve();
        }
        else if (data.type === "error") reject(new Error(data.message));
      };
      worker.onerror = (event) => reject(new Error(event.message || "The fly brain worker failed to start."));
      const command: FlyCommand = { type: "init", graph: graphBuffer, weights: weightsBuffer, preferGpu: true };
      worker.postMessage(command, [graphBuffer, weightsBuffer]);
    });
    worker.onmessage = ({ data }: MessageEvent<FlyReply>) => this.handle(data);
    worker.onerror = (event) => this.fail(new Error(event.message || "The fly brain worker crashed."));
    useFlyStore.getState().setStatus("ready");
    setDownload({ stage: "done", loaded: total, total });
  }

  private handle(reply: FlyReply): void {
    if (reply.type === "trace" && this.traces.has(reply.id)) {
      const fen = this.traces.get(reply.id)!;
      this.traces.delete(reply.id);
      useFlyStore.getState().setTrace({ id: reply.id, fen, frames: reply.frames, flows: reply.flows, steps: reply.steps, traceMs: reply.traceMs });
    } else if (reply.type === "trace") {
      const pending = this.pending.get(reply.id);
      if (pending && !pending.silent) {
        useFlyStore.getState().setTrace({ id: reply.id, fen: pending.fen, frames: reply.frames, flows: reply.flows, steps: reply.steps, traceMs: reply.traceMs });
      }
    } else if (reply.type === "progress") {
      if (this.pending.get(reply.id)?.silent === false) useFlyStore.getState().setThinking({ decision: reply.decision, elapsedMs: reply.elapsedMs });
    } else if (reply.type === "decision") {
      const pending = this.pending.get(reply.id);
      if (!pending) return;
      this.pending.delete(reply.id);
      if (pending.silent) {
        pending.resolve({ decision: reply.decision, thinkMs: reply.thinkMs });
        return;
      }
      if (reply.backend !== useFlyStore.getState().backend?.backend) {
        useFlyStore.getState().setBackend({ backend: reply.backend, adapter: reply.backend === "cpu" ? "CPU" : useFlyStore.getState().backend?.adapter ?? "WebGPU" });
      }
      useFlyStore.getState().setThought(
        { fen: pending.fen, decision: reply.decision, thinkMs: reply.thinkMs, retina: reply.retina, flipped: pending.fen.split(" ")[1] === "b" },
        reply.activity,
      );
      pending.resolve({ decision: reply.decision, thinkMs: reply.thinkMs });
    } else if (reply.type === "error") {
      const error = new Error(reply.message);
      if (reply.id !== undefined) {
        this.pending.get(reply.id)?.reject(error);
        this.pending.delete(reply.id);
      } else this.fail(error);
    }
  }

  private fail(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    useFlyStore.getState().setError(error.message);
  }

  get model(): FlyModelId { return DEFAULT_MODEL; }

  useModel(_id: FlyModelId): Promise<void> { return this.init(); }

  async think(fen: string, options: Partial<PlanOptions> = {}, wantActivity = true, silent = false): Promise<FlyThinkResult> {
    await this.init();
    const worker = this.worker;
    if (!worker) throw new Error("The fly brain is not available.");
    const id = this.nextId++;
    if (!silent) useFlyStore.getState().setStatus("thinking");
    return new Promise<FlyThinkResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, fen, silent });
      // Functions cannot cross the worker boundary; the worker uses its own random source.
      const { random: _random, onStage: _onStage, now: _now, ...plain } = { ...DEFAULT_PLAN, ...options };
      if (!silent) useFlyStore.getState().setThinking(null);
      const command: FlyCommand = { type: "think", id, fen, options: plain, wantActivity: wantActivity && !silent };
      worker.postMessage(command);
    });
  }

  /** Replay: record how a position spreads through the brain, without thinking about it. */
  async trace(fen: string): Promise<void> {
    await this.init();
    if (!this.worker) return;
    const id = this.nextId++;
    this.traces.set(id, fen);
    const command: FlyCommand = { type: "trace", id, fen };
    this.worker.postMessage(command);
  }

  destroy(): void {
    this.fail(new Error("The fly brain was shut down."));
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    useFlyStore.getState().setStatus("idle");
  }
}

let shared: FlyEngine | null = null;

/** Session-wide engine; games come and go, the brain stays loaded. */
export function getFlyEngine(): FlyEngine {
  if (!shared) shared = new FlyEngine();
  return shared;
}
