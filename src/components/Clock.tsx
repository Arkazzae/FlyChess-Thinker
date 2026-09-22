/**
 * Chess clock display component.
 */

import { useEffect } from "react";
import { useGameStore } from "@/state/game";
import { getTimeRemaining, formatTime, isUnlimited } from "@/engine/clock";
import type { PieceColor } from "@/engine/types";

interface Props {
  side: PieceColor;
}

export function Clock({ side }: Props) {
  const clock = useGameStore((s) => s.clock);
  const timeControl = useGameStore((s) => s.timeControl);
  const phase = useGameStore((s) => s.phase);
  const tickClock = useGameStore((s) => s.tickClock);

  // Tick every 100ms when clock is running
  useEffect(() => {
    if (phase !== "playing" || !clock.running) return;
    const id = setInterval(tickClock, 100);
    return () => clearInterval(id);
  }, [phase, clock.running, tickClock]);

  if (isUnlimited(timeControl)) return null;

  const remaining = getTimeRemaining(clock, side);
  const isActive = clock.running === side;
  const isLow = remaining < 30000 && remaining > 0;

  const classes = [
    "clock",
    isActive && "clock--active",
    isLow && isActive && "clock--low",
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{formatTime(remaining)}</div>;
}
