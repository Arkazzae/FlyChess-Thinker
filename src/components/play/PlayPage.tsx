import { useEffect } from "react";
import { useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";
import { Board } from "@/components/Board/Board";
import { BoardOverlays } from "./BoardOverlays";
import { GameOverDialog } from "./GameOverDialog";
import { PlayerBar } from "./PlayerBar";
import { RightPanel } from "./RightPanel";
import { EvalBar } from "./EvalBar";

export function PlayPage() {
  const phase = useGameStore((s) => s.phase);
  const flipped = useGameStore((s) => s.flipped);
  const side = useUiStore((s) => s.side);
  const showEval = useUiStore((s) => s.showEval);

  // Before the game the board faces the colour the player picked.
  useEffect(() => {
    if (phase === "lobby") useGameStore.setState({ flipped: side === "b" });
  }, [phase, side]);

  const top = flipped ? "w" : "b";
  const bottom = flipped ? "b" : "w";
  return (
    <div className={`play-page${showEval ? " has-eval" : ""}`}>
      <div className="board-column">
        <PlayerBar side={top} />
        <div className="board-area">
          {showEval && <EvalBar />}
          <Board interactive={phase !== "lobby"}>
            <BoardOverlays />
          </Board>
          <GameOverDialog />
        </div>
        <PlayerBar side={bottom} />
      </div>
      <RightPanel />
    </div>
  );
}
