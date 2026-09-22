/**
 * SVG overlay for arrows and circles on the board.
 * Supports both user-drawn (right-click) and analysis arrows.
 */

import { useGameStore } from "@/state/game";
import { squareToCoords, type Arrow, type CircleHighlight } from "@/engine/types";

interface Props {
  boardSize: number;
  flipped: boolean;
}

const COLORS: Record<string, string> = {
  green: "rgba(0, 180, 50, 0.7)",
  red: "rgba(220, 50, 50, 0.7)",
  yellow: "rgba(220, 200, 0, 0.7)",
  blue: "rgba(50, 100, 220, 0.7)",
};

function getSquareCenter(
  square: string,
  squareSize: number,
  flipped: boolean
): { x: number; y: number } {
  const { col, row } = squareToCoords(square as never);
  const x = flipped ? (7 - col) * squareSize + squareSize / 2 : col * squareSize + squareSize / 2;
  const y = flipped ? row * squareSize + squareSize / 2 : (7 - row) * squareSize + squareSize / 2;
  return { x, y };
}

export function ArrowOverlay({ boardSize, flipped }: Props) {
  const arrows = useGameStore((s) => s.arrows);
  const circles = useGameStore((s) => s.circles);

  if (arrows.length === 0 && circles.length === 0) return null;

  const sqSize = boardSize / 8;

  return (
    <svg
      className="board-svg-overlay"
      viewBox={`0 0 ${boardSize} ${boardSize}`}
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
    >
      {/* Circles */}
      {circles.map((c: CircleHighlight, i: number) => {
        const { x, y } = getSquareCenter(c.square, sqSize, flipped);
        return (
          <circle
            key={`circle-${c.square}-${c.color}-${i}`}
            cx={x}
            cy={y}
            r={sqSize * 0.4}
            fill="none"
            stroke={COLORS[c.color]}
            strokeWidth={sqSize * 0.08}
            opacity={0.8}
          />
        );
      })}

      {/* Arrows */}
      {arrows.map((a: Arrow, i: number) => {
        const from = getSquareCenter(a.from, sqSize, flipped);
        const to = getSquareCenter(a.to, sqSize, flipped);

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        if (length === 0) return null;

        const ux = dx / length;
        const uy = dy / length;
        const tipX = to.x - ux * sqSize * 0.12;
        const tipY = to.y - uy * sqSize * 0.12;
        const baseX = tipX - ux * sqSize * 0.34;
        const baseY = tipY - uy * sqSize * 0.34;
        const wing = sqSize * 0.2;
        const leftX = baseX - uy * wing;
        const leftY = baseY + ux * wing;
        const rightX = baseX + uy * wing;
        const rightY = baseY - ux * wing;

        return (
          <g key={`arrow-${a.from}-${a.to}-${a.color}-${i}`}>
            <line
              x1={from.x}
              y1={from.y}
              x2={baseX}
              y2={baseY}
              stroke={COLORS[a.color]}
              strokeWidth={sqSize * 0.16}
              strokeLinecap="round"
            />
            <polygon
              points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`}
              fill={COLORS[a.color]}
            />
          </g>
        );
      })}
    </svg>
  );
}
