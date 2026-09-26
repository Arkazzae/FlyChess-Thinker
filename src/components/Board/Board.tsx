/**
 * Main chess board component.
 * Integrates: rendering, click-to-move, drag-and-drop, highlights,
 * arrow overlay, user-drawn annotations (PPM), promotion picker.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chess } from "chess.js";
import { useGameStore } from "@/state/game";
import { useSettingsStore } from "@/state/settings";
import { SquareComponent } from "./Square";
import { PieceComponent } from "./Piece";
import { ArrowOverlay } from "./ArrowOverlay";
import { PromotionPicker } from "./PromotionPicker";
import { useDrawArrows } from "@/hooks/useDrawArrows";
import { playMoveSound } from "@/sounds";
import {
  squareToCoords,
  coordsToSquare,
  FILES,
  RANKS,
  type Square,
  type PieceColor,
} from "@/engine/types";
import { isCheck as checkIsCheck, getPiece, getTurn } from "@/engine/chess";
import "@/styles/board.css";

/** Replays the game up to `ply` for browsing the move list. */
function positionAt(live: Chess, ply: number): { chess: Chess; lastMove: { from: Square; to: Square } | null } {
  const history = live.history({ verbose: true });
  const chess = new Chess(history[0]?.before ?? live.fen());
  let lastMove: { from: Square; to: Square } | null = null;
  for (const move of history.slice(0, ply)) {
    chess.move(move.san);
    lastMove = { from: move.from as Square, to: move.to as Square };
  }
  return { chess, lastMove };
}

export function Board({ children, interactive = true }: { children?: ReactNode; interactive?: boolean }) {
  const liveChess = useGameStore((s) => s.chess);
  const fen = useGameStore((s) => s.fen);
  const viewPly = useGameStore((s) => s.viewPly);
  const browsing = viewPly !== null;
  const shown = useMemo(() => (viewPly === null ? null : positionAt(liveChess, viewPly)), [liveChess, fen, viewPly]);
  const chess = shown?.chess ?? liveChess;
  const flipped = useGameStore((s) => s.flipped);
  const selectedSquare = useGameStore((s) => s.selectedSquare);
  const legalMoves = useGameStore((s) => s.legalMoves);
  const liveLastMove = useGameStore((s) => s.lastMove);
  const lastMove = shown ? shown.lastMove : liveLastMove;
  const premove = useGameStore((s) => s.premove);
  const myColor = useGameStore((s) => s.myColor);
  const livePhase = useGameStore((s) => s.phase);
  // Browsing an earlier position, or a board shown before the game starts, is read-only.
  const phase = browsing || !interactive ? "review" : livePhase;
  const selectSquare = useGameStore((s) => s.selectSquare);
  const promotionPending = useGameStore((s) => s.promotionPending);

  const {
    showCoords,
    showLegalMoves,
    premoveEnabled,
    moveAnimation,
  } = useSettingsStore();

  const boardRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const [boardSize, setBoardSize] = useState(560);
  const [dragState, setDragState] = useState<{
    square: Square;
    color: PieceColor;
    type: string;
    x: number;
    y: number;
  } | null>(null);

  // Arrow drawing (right-click)
  const {
    onContextMenu,
    onPointerDown: onRightPointerDown,
    onPointerUp: onRightPointerUp,
    onPointerCancel: onRightPointerCancel,
  } = useDrawArrows(boardRef, flipped);

  // Build square order based on flip
  const ranks = flipped ? [...RANKS] : [...RANKS].reverse();
  const files = flipped ? [...FILES].reverse() : [...FILES];

  // Suppress unused fen warning — we need it for re-render subscription
  void fen;

  const inCheck = checkIsCheck(chess);
  const turn = getTurn(chess);
  const kingInCheck = inCheck ? findKing(turn) : null;

  function findKing(color: PieceColor): Square | null {
    for (const f of FILES) {
      for (const r of RANKS) {
        const sq = `${f}${r}` as Square;
        const p = getPiece(chess, sq);
        if (p && p.type === "k" && p.color === color) return sq;
      }
    }
    return null;
  }

  // ── Resolve pointer position to square ──
  function getSquareFromPoint(x: number, y: number): Square | null {
    const board = boardRef.current;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    const col = Math.floor(((x - rect.left) / rect.width) * 8);
    const row = Math.floor(((y - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const fileIdx = flipped ? 7 - col : col;
    const rankIdx = flipped ? row : 7 - row;
    return coordsToSquare(fileIdx, rankIdx);
  }

  // ── Shared: update clock + sound + clear annotations after a move ──
  function handlePostMove(move: { flags: string; captured?: string; san: string }) {
    const state = useGameStore.getState();
    state.clearAnnotations();
    playMoveSound(move);
  }

  // ── Apply a normal move (non-promotion) ──
  function applyPlayerMove(from: Square, to: Square) {
    const state = useGameStore.getState();
    const result = state.tryMove(from, to);

    if (result === "promotion") {
      // Picker will appear, unless the player always promotes to a queen.
      if (useSettingsStore.getState().autoQueen) handlePromotionConfirm("q");
      return;
    }

    if (result && typeof result === "object") {
      handlePostMove({ flags: result.flags, captured: result.captured, san: result.san });
    }
  }

  // ── Promotion confirmed ──
  function handlePromotionConfirm(piece: string) {
    const result = useGameStore.getState().confirmPromotion(piece);
    if (result) {
      handlePostMove({ flags: result.flags, captured: result.captured, san: result.san });
    }
  }

  // ── Click to move ──
  const handleSquareClick = useCallback(
    (square: Square) => {
      if (phase !== "playing" || promotionPending) return;
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }

      useGameStore.getState().clearAnnotations();

      // Premove is an optional interaction. When disabled, clicks made during
      // the opponent's turn must not leave a selection that can execute later.
      if (myColor && turn !== myColor && !premoveEnabled) {
        useGameStore.setState({
          selectedSquare: null,
          legalMoves: [],
          premove: null,
        });
        return;
      }

      // If we have a selected square and clicking a legal target
      if (selectedSquare && legalMoves.includes(square)) {
        applyPlayerMove(selectedSquare, square);
        return;
      }

      // Select/deselect
      selectSquare(square);
    },
    [
      selectedSquare,
      legalMoves,
      phase,
      selectSquare,
      promotionPending,
      myColor,
      turn,
      premoveEnabled,
    ]
  );

  // ── Drag to move ──
  const handleDragStart = useCallback(
    (square: Square, e: React.PointerEvent) => {
      // Only left button
      if (e.button !== 0) return;
      if (phase !== "playing" || promotionPending) return;

      const piece = getPiece(chess, square);
      if (!piece) return;

      if (myColor && piece.color !== myColor) return;
      const isPremoveDrag =
        !!myColor && piece.color === myColor && turn !== myColor;
      if (piece.color !== turn && (!premoveEnabled || !isPremoveDrag)) return;

      if (!isPremoveDrag) selectSquare(square);

      // Measure board for ArrowOverlay
      if (boardRef.current) {
        setBoardSize(boardRef.current.clientWidth);
      }

      setDragState({
        square,
        color: piece.color,
        type: piece.type,
        x: e.clientX,
        y: e.clientY,
      });

      const handleMove = (ev: PointerEvent) => {
        setDragState((prev) =>
          prev ? { ...prev, x: ev.clientX, y: ev.clientY } : null
        );
      };

      const handleUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);

        const target = getSquareFromPoint(ev.clientX, ev.clientY);
        setDragState(null);

        if (target && target !== square) {
          suppressClickRef.current = true;
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);

          if (isPremoveDrag) {
            const promotion =
              piece.type === "p" && (target[1] === "1" || target[1] === "8")
                ? "q"
                : undefined;
            useGameStore.getState().setPremove({
              from: square,
              to: target,
              promotion,
            });
            useGameStore.setState({ selectedSquare: null, legalMoves: [] });
          } else {
            applyPlayerMove(square, target);
          }
        }
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [
      chess,
      phase,
      myColor,
      turn,
      selectSquare,
      promotionPending,
      premoveEnabled,
    ]
  );

  // ── Measure board on mount for overlays ──
  const measuredRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        (boardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        setBoardSize(node.clientWidth);
      }
    },
    []
  );

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const updateSize = () => setBoardSize(board.clientWidth);
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  const sqSize = boardSize / 8;

  /**
   * Calculate pixel offset for slide animation.
   * The piece is now at `to` square; this returns how far it was from `from`.
   */
  function getSlideOffset(
    from: Square,
    to: Square,
    size: number,
    flip: boolean
  ): { dx: number; dy: number } {
    const fromCoords = squareToCoords(from);
    const toCoords = squareToCoords(to);
    const dCol = fromCoords.col - toCoords.col;
    const dRow = fromCoords.row - toCoords.row;
    return {
      dx: (flip ? -dCol : dCol) * size,
      dy: (flip ? dRow : -dRow) * size,
    };
  }

  return (
    <div
      className="board-wrapper"
      onContextMenu={onContextMenu}
      onPointerDown={onRightPointerDown}
      onPointerUp={onRightPointerUp}
      onPointerCancel={onRightPointerCancel}
      style={{ "--square-size": `${sqSize}px` } as React.CSSProperties}
    >
      <div
        className="board"
        ref={measuredRef}
      >
        {ranks.map((rank, rowIdx) =>
          files.map((file, colIdx) => {
            const square = `${file}${rank}` as Square;
            const { col, row } = squareToCoords(square);
            const isLight = (col + row) % 2 !== 0;
            const piece = getPiece(chess, square);
            const isSelected = selectedSquare === square;
            const isLastFrom = lastMove?.from === square;
            const isLastTo = lastMove?.to === square;
            const isLegal = showLegalMoves && legalMoves.includes(square);
            const hasPiece = piece !== null;
            const isPremoveSquare =
              premove?.from === square || premove?.to === square;

            return (
              <SquareComponent
                key={square}
                square={square}
                isLight={isLight}
                isSelected={isSelected}
                isLastMove={isLastFrom || isLastTo}
                isCheck={square === kingInCheck}
                isLegal={isLegal && !hasPiece}
                isLegalCapture={isLegal && hasPiece}
                isPremove={isPremoveSquare}
                showCoordFile={showCoords && rowIdx === 7}
                showCoordRank={showCoords && colIdx === 0}
                flipped={flipped}
                onClick={handleSquareClick}
                onDragStart={handleDragStart}
              >
                {piece && (
                  <PieceComponent
                    color={piece.color}
                    type={piece.type}
                    isDragging={dragState?.square === square}
                    isPremove={isPremoveSquare}
                    animateFrom={
                      isLastTo && lastMove
                        ? getSlideOffset(lastMove.from, lastMove.to, sqSize, flipped)
                        : null
                    }
                    animationKey={
                      isLastTo && lastMove
                        ? `${fen}:${viewPly ?? "live"}:${lastMove.from}-${lastMove.to}`
                        : null
                    }
                    animate={moveAnimation}
                  />
                )}
              </SquareComponent>
            );
          })
        )}
      </div>

      {children}

      {/* SVG overlay: arrows + circles */}
      <ArrowOverlay boardSize={boardSize} flipped={flipped} />

      {/* Promotion picker */}
      <PromotionPicker flipped={flipped} boardSize={boardSize} onConfirm={handlePromotionConfirm} />

      {/* Drag ghost */}
      {dragState && (
        <div
          className="drag-ghost"
          style={{
            left: dragState.x,
            top: dragState.y,
            "--square-size": `${sqSize}px`,
          } as React.CSSProperties}
        >
          <img
            src={`pieces/${dragState.color}${dragState.type}.png`}
            alt=""
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}
