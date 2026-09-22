import type { ReactElement } from "react";
import { useGameStore } from "@/state/game";
import { useFlyStore } from "@/state/fly";
import { useUiStore } from "@/state/ui";

function center(square: string, flipped: boolean): [number, number] {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return [(flipped ? 7 - file : file) + 0.5, (flipped ? rank : 7 - rank) + 0.5];
}

function Arrow({ from, to, flipped, color, opacity, width = 0.2 }: { from: string; to: string; flipped: boolean; color: string; opacity: number; width?: number }) {
  const [x1, y1] = center(from, flipped);
  const [x2, y2] = center(to, flipped);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 0.1) return null;
  const ux = dx / length;
  const uy = dy / length;
  const head = 0.42;
  const start = 0.28;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const px = -uy;
  const py = ux;
  const half = width / 2;
  const hw = width * 1.55;
  const points = [
    [x1 + ux * start + px * half, y1 + uy * start + py * half],
    [bx + px * half, by + py * half],
    [bx + px * hw, by + py * hw],
    [x2, y2],
    [bx - px * hw, by - py * hw],
    [bx - px * half, by - py * half],
    [x1 + ux * start - px * half, y1 + uy * start - py * half],
  ].map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(" ");
  return <polygon points={points} fill={color} opacity={opacity} />;
}

/** Hint arrow and the fly's visible thoughts, drawn over the board. */
export function BoardOverlays() {
  const flipped = useGameStore((s) => s.flipped);
  const fen = useGameStore((s) => s.fen);
  const phase = useGameStore((s) => s.phase);
  const viewPly = useGameStore((s) => s.viewPly);
  const hint = useUiStore((s) => s.hint);
  const showThoughts = useUiStore((s) => s.showThoughts);
  const status = useFlyStore((s) => s.status);
  const thinking = useFlyStore((s) => s.thinking);
  const thought = useFlyStore((s) => s.thought);
  if (viewPly !== null || phase === "lobby") return null;

  const arrows: ReactElement[] = [];
  if (showThoughts && phase === "playing") {
    if (status === "thinking" && thinking && thought?.fen !== fen) {
      const decision = thinking.decision;
      const top = Math.max(...decision.candidates.map((c) => c.prior), 1e-6);
      decision.candidates.slice(0, 4).forEach((candidate) => {
        const best = candidate.uci === decision.move;
        arrows.push(<Arrow key={`t-${candidate.uci}`} from={candidate.uci.slice(0, 2)} to={candidate.uci.slice(2, 4)} flipped={flipped}
          color={best ? "#ffaa00" : "#f1e6cf"} opacity={best ? 0.8 : 0.25 + 0.4 * (candidate.prior / top)} width={best ? 0.2 : 0.13} />);
      });
    }
  }
  if (hint) arrows.push(<Arrow key="hint" from={hint.from} to={hint.to} flipped={flipped} color="#81b64c" opacity={0.9} />);
  if (!arrows.length && !hint) return null;
  return (
    <svg className="board-overlay" viewBox="0 0 8 8" aria-hidden="true">
      {hint && <rect x={center(hint.from, flipped)[0] - 0.5} y={center(hint.from, flipped)[1] - 0.5} width="1" height="1" fill="#81b64c" opacity=".45" />}
      {arrows}
    </svg>
  );
}
