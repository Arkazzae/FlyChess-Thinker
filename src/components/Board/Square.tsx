/**
 * Single chess board square.
 */

import { type ReactNode } from "react";
import type { Square as SquareType } from "@/engine/types";

interface Props {
  square: SquareType;
  isLight: boolean;
  isSelected: boolean;
  isLastMove: boolean;
  isCheck: boolean;
  isLegal: boolean;
  isLegalCapture: boolean;
  isPremove: boolean;
  showCoordFile: boolean;
  showCoordRank: boolean;
  flipped: boolean;
  onClick: (sq: SquareType) => void;
  onDragStart: (sq: SquareType, e: React.PointerEvent) => void;
  children?: ReactNode;
}

export function SquareComponent({
  square,
  isLight,
  isSelected,
  isLastMove,
  isCheck,
  isLegal,
  isLegalCapture,
  isPremove,
  showCoordFile,
  showCoordRank,
  flipped: _flipped,
  onClick,
  onDragStart,
  children,
}: Props) {
  const classes = [
    "square",
    isLight ? "square--light" : "square--dark",
    isSelected && "square--selected",
    isLastMove && "square--last-move",
    isCheck && "square--check",
    isPremove && "square--premove",
    isLegal && !isLegalCapture && "square--legal",
    isLegalCapture && "square--legal-capture",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      data-square={square}
      onClick={() => onClick(square)}
      onPointerDown={(e) => {
        if (e.button === 0 && children) {
          onDragStart(square, e);
        }
      }}
    >
      {showCoordRank && (
        <span className="coord coord--rank">{square[1]}</span>
      )}
      {showCoordFile && (
        <span className="coord coord--file">{square[0]}</span>
      )}
      {children}
    </div>
  );
}
