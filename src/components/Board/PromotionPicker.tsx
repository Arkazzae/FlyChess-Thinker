/**
 * Promotion piece picker — appears above the target square.
 */

import { useGameStore } from "@/state/game";
import { squareToCoords, type PieceColor } from "@/engine/types";

const PROMO_PIECES = ["q", "r", "b", "n"] as const;

interface Props {
  flipped: boolean;
  boardSize: number;
  onConfirm: (piece: string) => void;
}

export function PromotionPicker({ flipped, boardSize, onConfirm }: Props) {
  const promotionPending = useGameStore((s) => s.promotionPending);
  const cancelPromotion = useGameStore((s) => s.cancelPromotion);
  const myColor = useGameStore((s) => s.myColor);

  if (!promotionPending) return null;

  const sqSize = boardSize / 8;
  const { col, row } = squareToCoords(promotionPending.to);

  const color: PieceColor = row === 7 ? "w" : "b";
  const displayCol = flipped ? 7 - col : col;
  const isFromTop = (color === "w" && !flipped) || (color === "b" && flipped);

  const left = displayCol * sqSize;
  const top = isFromTop ? 0 : sqSize * 4;

  const orderedPieces = isFromTop
    ? PROMO_PIECES
    : [...PROMO_PIECES].reverse();

  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 9,
        }}
        onClick={cancelPromotion}
      />

      <div
        className="promotion-picker"
        style={{
          position: "absolute",
          left,
          top,
          zIndex: 10,
          "--square-size": `${sqSize}px`,
        } as React.CSSProperties}
      >
        {orderedPieces.map((piece) => (
          <button
            key={piece}
            onClick={() => onConfirm(piece)}
            style={{ width: sqSize, height: sqSize }}
          >
            <img
              src={`pieces/${myColor ?? color}${piece}.png`}
              alt={piece}
              draggable={false}
            />
          </button>
        ))}
      </div>
    </>
  );
}
