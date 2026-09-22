/**
 * Game review: after the game, Stockfish goes through every position once (its own worker, so the
 * live evaluation bar is not disturbed). From the evaluations each move gets a class, and each
 * side an accuracy, the way the big chess sites do it (winning-chance loss per move).
 */

import { create } from "zustand";
import { Chess } from "chess.js";
import { useGameStore } from "@/state/game";

const DEPTH = 14;

export interface PositionEval {
  /** Centipawns from White's point of view (null when a mate is known). */
  cp: number | null;
  /** Moves to mate, positive = White mates; 0 = the side to move is already mated. */
  mate: number | null;
  /** Stockfish's best move in UCI, null in finished positions. */
  best: string | null;
}

export type MoveClass = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export interface ReviewedMove {
  san: string;
  uci: string;
  color: "w" | "b";
  cls: MoveClass;
  /** Winning chances lost by the mover, 0–100. */
  loss: number;
  best: string | null;
}

interface ReviewState {
  status: "idle" | "running" | "done";
  /** fens[i] is the position before move i + 1; fens[0] the start. */
  fens: string[];
  evals: (PositionEval | null)[];
  run: number;
  autoplay: boolean;
  setAutoplay: (on: boolean) => void;
  reset: () => void;
}

export const useReviewStore = create<ReviewState>((set) => ({
  status: "idle",
  fens: [],
  evals: [],
  run: 0,
  autoplay: false,
  setAutoplay: (autoplay) => set({ autoplay }),
  reset: () => set((state) => ({ status: "idle", fens: [], evals: [], run: state.run + 1, autoplay: false })),
}));

/** White's winning chances, 0–100 (the curve Lichess uses). */
export function winPercent(evaluation: PositionEval | null): number {
  if (!evaluation) return 50;
  if (evaluation.mate !== null) return evaluation.mate > 0 ? 100 : evaluation.mate < 0 ? 0 : 50;
  const cp = Math.max(-1000, Math.min(1000, evaluation.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Finished positions are judged by the rules. */
function terminalEval(fen: string): PositionEval | null {
  const position = new Chess(fen);
  if (position.isCheckmate()) return { cp: null, mate: position.turn() === "w" ? -1 : 1, best: null };
  if (position.isDraw() || position.isStalemate()) return { cp: 0, mate: null, best: null };
  return null;
}

let worker: Worker | null = null;

function engine(): Worker {
  if (worker) return worker;
  const url = new URL("./stockfish.js", document.baseURI).href;
  const blob = new Blob([`importScripts(${JSON.stringify(url)});`], { type: "text/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  worker = new Worker(blobUrl);
  URL.revokeObjectURL(blobUrl);
  worker.postMessage("uci");
  worker.postMessage("setoption name Hash value 32");
  return worker;
}

function analyse(fen: string): Promise<PositionEval> {
  const sf = engine();
  const sign = fen.split(" ")[1] === "w" ? 1 : -1;
  return new Promise((resolve) => {
    let result: PositionEval = { cp: 0, mate: null, best: null };
    // A search abandoned by an earlier review may still answer; everything before "readyok"
    // belongs to it, and only then does this position's search start.
    let searching = false;
    sf.onmessage = ({ data }: MessageEvent<string>) => {
      if (typeof data !== "string") return;
      if (!searching) {
        if (data === "readyok") {
          searching = true;
          sf.postMessage("ucinewgame");
          sf.postMessage(`position fen ${fen}`);
          sf.postMessage(`go depth ${DEPTH}`);
        }
        return;
      }
      if (data.startsWith("info") && data.includes(" score ") && !/ multipv (?!1\b)\d+/.test(data)
        && !data.includes("bound")) {
        const cp = data.match(/ score cp (-?\d+)/);
        const mate = data.match(/ score mate (-?\d+)/);
        result = { cp: cp ? Number(cp[1]) * sign : null, mate: mate ? Number(mate[1]) * sign : null, best: result.best };
      } else if (data.startsWith("bestmove")) {
        const best = data.split(" ")[1];
        resolve({ ...result, best: best && best !== "(none)" ? best : null });
      }
    };
    sf.postMessage("stop");
    sf.postMessage("isready");
  });
}

/** Analyse the finished game; results appear position by position. */
export async function startReview(): Promise<void> {
  const history = useGameStore.getState().chess.history({ verbose: true });
  if (!history.length) return;
  const fens = [history[0].before, ...history.map((move) => move.after)];
  const state = useReviewStore.getState();
  if (state.status !== "idle" && state.fens.join() === fens.join()) return;
  const run = state.run + 1;
  useReviewStore.setState({ status: "running", fens, evals: fens.map(() => null), run });
  for (let i = 0; i < fens.length; i++) {
    const evaluation = terminalEval(fens[i]) ?? (await analyse(fens[i]));
    if (useReviewStore.getState().run !== run) return; // a new game or review replaced this one
    useReviewStore.setState((s) => {
      const evals = s.evals.slice();
      evals[i] = evaluation;
      return { evals };
    });
  }
  useReviewStore.setState({ status: "done" });
}

/** Classes for every move whose before and after positions are evaluated. */
export function reviewMoves(fens: string[], evals: (PositionEval | null)[]): (ReviewedMove | null)[] {
  const history = useGameStore.getState().chess.history({ verbose: true });
  return history.map((move, i) => {
    const before = evals[i];
    const after = evals[i + 1];
    if (!before || !after || fens[i] !== move.before) return null;
    const sign = move.color === "w" ? 1 : -1;
    const loss = Math.max(0, sign * (winPercent(before) - winPercent(after)));
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    const cls: MoveClass = uci === before.best || loss < 1 ? "best" : loss >= 15 ? "blunder" : loss >= 10 ? "mistake" : loss >= 5 ? "inaccuracy" : "good";
    return { san: move.san, uci, color: move.color as "w" | "b", cls, loss, best: before.best };
  });
}

/** Per-move accuracy averaged over a side's moves (Lichess formula), or null before any are reviewed. */
export function accuracy(moves: (ReviewedMove | null)[], color: "w" | "b"): number | null {
  const own = moves.filter((move): move is ReviewedMove => !!move && move.color === color);
  if (!own.length) return null;
  const total = own.reduce((sum, move) => sum + Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * move.loss) - 3.1669)), 0);
  return total / own.length;
}

// A new game, or a takeback, makes the old review meaningless.
useGameStore.subscribe((state, previous) => {
  if (state.phase === "playing" && previous.phase !== "playing") useReviewStore.getState().reset();
});
