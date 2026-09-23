import { useEffect } from "react";
import { useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";
import { Board } from "@/components/Board/Board";
import { BoardOverlays } from "./BoardOverlays";
import { GameOverDialog } from "./GameOverDialog";
import { PlayerBar } from "./PlayerBar";
import { RightPanel } from "./RightPanel";
import { EvalBar } from "./EvalBar";
import { MobileBar } from "./MobileBar";
import { MoveStrip } from "./MoveStrip";

export function PlayPage() {
  const phase = useGameStore((s) => s.phase);
  const flipped = useGameStore((s) => s.flipped);
  const side = useUiStore((s) => s.side);
  const showEval = useUiStore((s) => s.showEval);

  // On a phone the player scrolls down to the Play button; the game itself must start with the
  // board in view, and so must the bot screen after a game.
  useEffect(() => {
    document.querySelector(".app__main")?.scrollTo({ top: 0 });
  }, [phase === "lobby"]);

  // Before the game the board faces the colour the player picked.
  useEffect(() => {
    if (phase === "lobby") useGameStore.setState({ flipped: side === "b" });
  }, [phase, side]);

  const top = flipped ? "w" : "b";
  const bottom = flipped ? "b" : "w";
  return (
    <div className={`play-page${showEval ? " has-eval" : ""}${phase === "lobby" ? " is-lobby" : ""}`}>
      <div className="board-column">
        <MoveStrip />
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
      <MobileBar />
    </div>
  );
}
