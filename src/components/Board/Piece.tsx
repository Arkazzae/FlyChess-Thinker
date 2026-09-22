/**
 * Chess piece image component.
 * Supports slide animation via CSS transform transition.
 */

import { useEffect, useRef, useState } from "react";
import type { PieceColor, PieceType } from "@/engine/types";

interface Props {
  color: PieceColor;
  type: PieceType;
  isDragging?: boolean;
  isPremove?: boolean;
  /** Pixel offset to animate FROM (piece slides from this offset to 0,0) */
  animateFrom?: { dx: number; dy: number } | null;
  /** Stable identity of the move; unrelated board renders must not replay it. */
  animationKey?: string | null;
  /** Whether move animation is enabled */
  animate?: boolean;
}

function getPieceUrl(color: PieceColor, type: PieceType): string {
  return `pieces/${color}${type}.png`;
}

export function PieceComponent({
  color,
  type,
  isDragging,
  isPremove,
  animateFrom,
  animationKey,
  animate = true,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(animateFrom);

  // When animateFrom changes, set initial offset then clear it to trigger transition
  useEffect(() => {
    if (!animate || !animateFrom) {
      setOffset(null);
      return;
    }

    // Set the starting offset immediately (no transition)
    setOffset(animateFrom);

    // Next frame: clear offset → piece slides to (0,0)
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setOffset(null);
      });
    });

    return () => cancelAnimationFrame(raf);
    // Offset changes caused by board measurement or selection are deliberately
    // ignored. Only a new move identity may replay the slide.
  }, [animationKey, animate]);

  const classes = [
    "piece",
    isDragging && "piece--dragging",
    isPremove && "piece--premove",
  ]
    .filter(Boolean)
    .join(" ");

  const style: React.CSSProperties = {};
  if (offset) {
    style.transform = `translate(${offset.dx}px, ${offset.dy}px)`;
    style.transition = "none";
  } else if (animate && animateFrom) {
    style.transform = "translate(0, 0)";
    style.transition = "transform 150ms ease-out";
  }

  return (
    <div className={classes} ref={ref} style={style}>
      <img
        src={getPieceUrl(color, type)}
        alt={`${color === "w" ? "White" : "Black"} ${type}`}
        draggable={false}
      />
    </div>
  );
}
