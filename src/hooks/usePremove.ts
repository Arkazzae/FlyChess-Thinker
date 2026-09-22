/**
 * Premove hook — queue a move before your turn.
 * Executes instantly when it becomes your turn (if legal).
 */

import { useEffect, useCallback } from "react";
import { useGameStore } from "@/state/game";
import { useSettingsStore } from "@/state/settings";
import { getTurn, makeMove } from "@/engine/chess";
import { playMoveSound } from "@/sounds";
import type { Move, Square } from "@/engine/types";

export function usePremove() {
  const premoveEnabled = useSettingsStore((s) => s.premoveEnabled);
  const premove = useGameStore((s) => s.premove);
  const myColor = useGameStore((s) => s.myColor);
  const phase = useGameStore((s) => s.phase);
  const fen = useGameStore((s) => s.fen);
  const chess = useGameStore((s) => s.chess);

  // Premove follows the same rules in local bot and multiplayer games.
  const canPremove =
    premoveEnabled && phase === "playing" && myColor !== null;

  useEffect(() => {
    if ((!premoveEnabled || phase !== "playing" || !myColor) && premove) {
      useGameStore.setState({
        premove: null,
        selectedSquare: null,
        legalMoves: [],
      });
    }
  }, [premoveEnabled, phase, myColor, premove]);

  // Execute premove when turn changes to our color
  useEffect(() => {
    if (!canPremove || !premove || !myColor) return;

    const turn = getTurn(chess);
    if (turn !== myColor) return;

    // Try to execute the premove
    const result = makeMove(chess, premove.from, premove.to, premove.promotion);

    if (result) {
      useGameStore.getState().applyMove(result as unknown as Move);
      playMoveSound(result);
    } else {
      // Premove was illegal — cancel
      useGameStore.setState({ premove: null });
    }
  }, [fen, canPremove, premove, myColor, chess]);

  // Set a premove (called when clicking during opponent's turn)
  const setPremove = useCallback(
    (from: Square, to: Square, promotion?: string) => {
      if (!canPremove) return;
      useGameStore.setState({
        premove: { from, to, promotion },
        selectedSquare: null,
        legalMoves: [],
      });
    },
    [canPremove]
  );

  const cancelPremove = useCallback(() => {
    useGameStore.setState({ premove: null });
  }, []);

  return { canPremove, setPremove, cancelPremove };
}
