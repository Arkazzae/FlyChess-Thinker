/**
 * Game-wide effects: detecting the end of the game and keyboard navigation
 * through the move list.
 */

import { useEffect, useRef } from "react";
import { useGameStore } from "@/state/game";
import { isFlagged, isUnlimited } from "@/engine/clock";
import { drawClaim, seenPositions } from "@/ai/fly/planner";
import { finishGame } from "@/game/session";

export function useGameLifecycle(): void {
  const fen = useGameStore((s) => s.fen);
  const phase = useGameStore((s) => s.phase);
  const clock = useGameStore((s) => s.clock);
  const myColor = useGameStore((s) => s.myColor);
  const warned = useRef(false);

  useEffect(() => {
    const { chess, botId } = useGameStore.getState();
    if (phase !== "playing") return;
    if (chess.isCheckmate()) finishGame({ winner: chess.turn() === "w" ? "b" : "w", reason: "checkmate" });
    else if (chess.isStalemate()) finishGame({ winner: null, reason: "stalemate" });
    else if (chess.isInsufficientMaterial()) finishGame({ winner: null, reason: "insufficient" });
    else if (chess.isThreefoldRepetition()) finishGame({ winner: null, reason: "threefold" });
    else if (chess.isDrawByFiftyMoves()) finishGame({ winner: null, reason: "fifty_moves" });
    else if (botId) {
      // Match the model's claim_draw=True protocol before asking it for a move.
      const reason=drawClaim(chess,seenPositions(chess.history({verbose:true}),chess.fen()));
      if(reason) finishGame({winner:null,reason});
    }
  }, [fen, phase]);

  useEffect(() => {
    const { timeControl } = useGameStore.getState();
    if (phase !== "playing" || isUnlimited(timeControl)) return;
    if (isFlagged(clock, "w")) finishGame({ winner: "b", reason: "timeout" });
    else if (isFlagged(clock, "b")) finishGame({ winner: "w", reason: "timeout" });
  }, [clock, phase, myColor]);

  useEffect(() => {
    if (phase === "lobby") warned.current = false;
  }, [phase]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || target.getAttribute("role") === "slider")) return;
      const { moves, viewPly, setViewPly } = useGameStore.getState();
      const current = viewPly ?? moves.length;
      if (event.key === "ArrowLeft") setViewPly(current - 1);
      else if (event.key === "ArrowRight") setViewPly(current + 1);
      else if (event.key === "Home") setViewPly(0);
      else if (event.key === "End") setViewPly(null);
      else if (event.key === "f" && !event.ctrlKey && !event.metaKey) useGameStore.getState().flipBoard();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
