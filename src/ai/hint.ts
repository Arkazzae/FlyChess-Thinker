/**
 * Hint for the player: the same connectome thinks about the player's position
 * (one planning stage, 3 candidates × 2 replies) without touching the brain view.
 */

import { getFlyEngine } from "./fly/engine";
import { seenPositions } from "./fly/planner";
import { useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";
import type { Square } from "@/engine/types";
import { t } from "@/i18n";

export async function requestHint(): Promise<void> {
  const ui = useUiStore.getState();
  const game = useGameStore.getState();
  if (ui.hintLoading || game.phase !== "playing" || !game.myColor || game.chess.turn() !== game.myColor) return;
  const fen = game.chess.fen();
  ui.setHintLoading(true);
  try {
    const { decision } = await getFlyEngine().think(fen, {
      candidates: 3,
      replies: 2,
      temperature: 0,
      seen: seenPositions(game.chess.history({ verbose: true }), fen),
    }, false, true);
    if (useGameStore.getState().chess.fen() !== fen) return;
    useUiStore.getState().setHint({ from: decision.move.slice(0, 2) as Square, to: decision.move.slice(2, 4) as Square });
  } catch (error) {
    useUiStore.getState().showToast(t("toast.hintFailed"));
    console.error(error);
  } finally {
    useUiStore.getState().setHintLoading(false);
  }
}

// A hint belongs to one position: any move clears it.
useGameStore.subscribe((state, previous) => {
  if (state.fen !== previous.fen && useUiStore.getState().hint) useUiStore.getState().setHint(null);
});
