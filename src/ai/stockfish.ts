/**
 * Stockfish (public/stockfish.js, GPL-3.0, WebAssembly) running in its own worker, used only for
 * the evaluation bar. It never plays: the fly's moves come from the connectome alone.
 *
 * One search at a time. A new position stops the running search and starts once Stockfish has
 * answered the stop, so a late line can never be attributed to the wrong position.
 */

import { create } from "zustand";

export interface Evaluation {
  fen: string;
  /** Centipawns from White's point of view (null while only a mate score is known). */
  cp: number | null;
  /** Moves to mate from White's point of view: positive = White mates. */
  mate: number | null;
  depth: number;
}

interface EvalState {
  evaluation: Evaluation | null;
  set: (evaluation: Evaluation | null) => void;
}

export const useEvalStore = create<EvalState>((set) => ({
  evaluation: null,
  set: (evaluation) => set({ evaluation }),
}));

const MAX_DEPTH = 18;
const MOVE_TIME_MS = 2500;

class StockfishAnalyser {
  private worker: Worker | null = null;
  private current: string | null = null;
  private queued: string | null = null;
  private stopping = false;

  private start(): Worker {
    if (this.worker) return this.worker;
    const url = new URL("./stockfish.js", document.baseURI).href;
    const blob = new Blob([`importScripts(${JSON.stringify(url)});`], { type: "text/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(blobUrl);
    URL.revokeObjectURL(blobUrl);
    worker.onmessage = ({ data }: MessageEvent<string>) => this.handle(data);
    worker.postMessage("uci");
    worker.postMessage("setoption name Hash value 32");
    this.worker = worker;
    return worker;
  }

  analyse(fen: string): void {
    if (this.current === fen && !this.stopping) return;
    this.start();
    if (this.current && !this.stopping) {
      this.stopping = true;
      this.worker!.postMessage("stop");
    }
    this.queued = fen;
    if (!this.current) this.next();
  }

  private next(): void {
    const fen = this.queued;
    this.queued = null;
    this.current = fen;
    this.stopping = false;
    if (!fen) return;
    this.worker!.postMessage(`position fen ${fen}`);
    this.worker!.postMessage(`go depth ${MAX_DEPTH} movetime ${MOVE_TIME_MS}`);
  }

  private handle(line: string): void {
    if (typeof line !== "string") return;
    if (line.startsWith("bestmove")) {
      this.current = null;
      if (this.queued) this.next();
      return;
    }
    if (this.stopping || !this.current || !line.startsWith("info") || !line.includes(" score ")) return;
    if (/ multipv (?!1\b)\d+/.test(line)) return;
    const depth = Number(line.match(/ depth (\d+)/)?.[1] ?? 0);
    const cp = line.match(/ score cp (-?\d+)/);
    const mate = line.match(/ score mate (-?\d+)/);
    if (line.includes(" lowerbound") || line.includes(" upperbound")) return;
    const sign = this.current.split(" ")[1] === "w" ? 1 : -1;
    useEvalStore.getState().set({
      fen: this.current,
      cp: cp ? Number(cp[1]) * sign : null,
      mate: mate ? Number(mate[1]) * sign : null,
      depth,
    });
  }

  stop(): void {
    if (this.current && !this.stopping) {
      this.stopping = true;
      this.worker?.postMessage("stop");
    }
    this.queued = null;
  }
}

export const stockfish = new StockfishAnalyser();
