import { useEffect, useRef } from "react";
import { useGameStore } from "@/state/game";

/** Phones only: the moves as one horizontal line under the top bar, like chess apps do. */
export function MoveStrip() {
  const moves = useGameStore((s) => s.moves);
  const viewPly = useGameStore((s) => s.viewPly);
  const setViewPly = useGameStore((s) => s.setViewPly);
  const phase = useGameStore((s) => s.phase);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const current = viewPly ?? moves.length;

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>(".is-current");
    // Horizontal only, so the page never jumps.
    if (active) strip.scrollLeft = active.offsetLeft - strip.clientWidth / 2 + active.offsetWidth / 2;
    else strip.scrollLeft = strip.scrollWidth;
  }, [moves.length, current]);

  if (phase === "lobby") return null;
  return (
    <div className="move-strip" ref={stripRef}>
      {moves.map((san, ply) => (
        <button key={ply} type="button" className={current === ply + 1 ? "is-current" : ""} onClick={() => setViewPly(ply + 1)}>
          {ply % 2 === 0 && <span>{ply / 2 + 1}.</span>}
          {san}
        </button>
      ))}
    </div>
  );
}
