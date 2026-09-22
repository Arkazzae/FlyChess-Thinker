import { useEffect, useMemo } from "react";
import { Chess } from "chess.js";
import { useGameStore } from "@/state/game";
import { stockfish, useEvalStore } from "@/ai/stockfish";
import { useReviewStore } from "@/ai/review";
import { useTranslation } from "@/i18n";

/** The position on the board: the live one, or the one being browsed in the move list. */
function useShownFen(): string {
  const chess = useGameStore((s) => s.chess);
  const fen = useGameStore((s) => s.fen);
  const viewPly = useGameStore((s) => s.viewPly);
  return useMemo(() => {
    if (viewPly === null) return fen;
    const history = chess.history({ verbose: true });
    if (viewPly === 0) return history[0]?.before ?? fen;
    return history[viewPly - 1]?.after ?? fen;
  }, [chess, fen, viewPly]);
}

/** White's share of the bar, 0–100, on the usual winning-chances curve. */
function whiteShare(cp: number | null, mate: number | null): number {
  if (mate !== null) return mate > 0 ? 100 : mate < 0 ? 0 : 50;
  const chances = 2 / (1 + Math.exp(-0.00368208 * (cp ?? 0))) - 1;
  return Math.max(4, Math.min(96, 50 + 50 * chances));
}

function label(cp: number | null, mate: number | null): string {
  if (mate !== null) return mate === 0 ? "#" : `M${Math.abs(mate)}`;
  return (Math.abs(cp ?? 0) / 100).toFixed(1);
}

/** Stockfish's opinion of the position, as a vertical bar beside the board. */
export function EvalBar() {
  const { t } = useTranslation();
  const flipped = useGameStore((s) => s.flipped);
  const phase = useGameStore((s) => s.phase);
  const fen = useShownFen();
  const live = useEvalStore((s) => s.evaluation);
  // In a game review the deeper, already finished analysis is used when it covers this position.
  const reviewed = useReviewStore((s) => {
    const index = s.fens.indexOf(fen);
    return index >= 0 ? s.evals[index] : null;
  });
  const evaluation = reviewed ? { fen, cp: reviewed.cp, mate: reviewed.mate, depth: 14 } : live;

  // Finished positions are judged by the rules, not by the engine.
  const terminal = useMemo(() => {
    const position = new Chess(fen);
    // The side to move is mated: a full bar for the other side.
    if (position.isCheckmate()) return { cp: null, mate: position.turn() === "w" ? -1 : 1, text: "#" };
    if (position.isDraw() || position.isStalemate()) return { cp: 0, mate: null, text: "½" };
    return null;
  }, [fen]);

  useEffect(() => {
    if (phase === "lobby" || terminal || reviewed) {
      stockfish.stop();
      return;
    }
    stockfish.analyse(fen);
  }, [fen, phase, terminal, reviewed]);

  const current = evaluation?.fen === fen ? evaluation : null;
  const cp = terminal ? terminal.cp : current?.cp ?? null;
  const mate = terminal ? terminal.mate : current?.mate ?? null;
  const known = phase === "lobby" || terminal !== null || current !== null;
  const share = phase === "lobby" ? 50 : known ? whiteShare(cp, mate) : undefined;
  const whiteAhead = mate !== null ? mate > 0 : (cp ?? 0) >= 0;
  const text = terminal ? terminal.text : label(cp, mate);

  return (
    <div
      className={`eval-bar${flipped ? " is-flipped" : ""}`}
      role="meter"
      aria-label={t("eval.aria")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share ?? 50)}
      title={current ? t("eval.depth", { depth: current.depth }) : undefined}
    >
      <div className="eval-bar__white" style={{ height: `${share ?? 50}%` }} />
      {known && phase !== "lobby" && (
        <span className={`eval-bar__label ${whiteAhead ? "is-white" : "is-black"}`}>{text}</span>
      )}
    </div>
  );
}
