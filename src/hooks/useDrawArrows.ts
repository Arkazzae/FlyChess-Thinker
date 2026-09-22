/**
 * User-drawn arrows & circles via right-click + drag.
 *
 * Interactions:
 *   Right-click square           → toggle colored circle
 *   Right-click drag A → B       → toggle colored arrow
 *   Left-click / make a move     → clear all annotations
 *
 * Color modifiers:
 *   None  = green
 *   Shift = red
 *   Ctrl  = blue
 *   Alt   = yellow
 *
 * State lives in the Zustand game store (arrows[], circles[]).
 */

import { useRef, useCallback } from "react";
import { useGameStore } from "@/state/game";
import type { Square, Arrow, CircleHighlight } from "@/engine/types";
import { coordsToSquare } from "@/engine/types";

function colorFromModifiers(e: MouseEvent | PointerEvent): Arrow["color"] {
  if (e.shiftKey) return "red";
  if (e.ctrlKey || e.metaKey) return "blue";
  if (e.altKey) return "yellow";
  return "green";
}

/**
 * Resolve a pointer position to a board square.
 * Needs the board element ref and flip state.
 */
function squareFromPoint(
  x: number,
  y: number,
  boardEl: HTMLDivElement,
  flipped: boolean
): Square | null {
  const rect = boardEl.getBoundingClientRect();
  const col = Math.floor(((x - rect.left) / rect.width) * 8);
  const row = Math.floor(((y - rect.top) / rect.height) * 8);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const fileIdx = flipped ? 7 - col : col;
  const rankIdx = flipped ? row : 7 - row;
  return coordsToSquare(fileIdx, rankIdx);
}

export function useDrawArrows(
  boardRef: React.RefObject<HTMLDivElement | null>,
  flipped: boolean
) {
  const drawOriginRef = useRef<{
    square: Square;
    color: Arrow["color"];
  } | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  // ── Prevent default context menu on the board ──
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ── Right-button down: record origin square + color ──
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only right button (button === 2)
      if (e.button !== 2) return;
      e.preventDefault();
      e.stopPropagation();

      const board = boardRef.current;
      if (!board) return;

      const sq = squareFromPoint(e.clientX, e.clientY, board, flipped);
      if (!sq) return;

      drawOriginRef.current = {
        square: sq,
        color: colorFromModifiers(e.nativeEvent),
      };
      pointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [boardRef, flipped]
  );

  // ── Right-button up: decide circle vs arrow vs clear ──
  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      e.stopPropagation();

      const origin = drawOriginRef.current;
      drawOriginRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      pointerIdRef.current = null;

      const board = boardRef.current;
      if (!board) return;

      const target = squareFromPoint(e.clientX, e.clientY, board, flipped);

      // No origin recorded — shouldn't happen, but safe guard
      if (!origin) {
        useGameStore.getState().clearAnnotations();
        return;
      }

      const store = useGameStore.getState();

      // ── Same square or released outside board: toggle circle ──
      if (!target || target === origin.square) {
        const existing = store.circles;
        const idx = existing.findIndex(
          (c) => c.square === origin.square && c.color === origin.color
        );

        if (idx >= 0) {
          // Remove matching circle
          useGameStore.setState({
            circles: existing.filter((_, i) => i !== idx),
          });
        } else {
          // Add circle
          const circle: CircleHighlight = {
            square: origin.square,
            color: origin.color,
          };
          useGameStore.setState({ circles: [...existing, circle] });
        }
        return;
      }

      // ── Different square: toggle arrow ──
      const existing = store.arrows;
      const exactIndex = existing.findIndex(
        (a) =>
          a.from === origin.square &&
          a.to === target &&
          a.color === origin.color
      );

      if (exactIndex >= 0) {
        useGameStore.setState({
          arrows: existing.filter((_, i) => i !== exactIndex),
        });
      } else {
        const arrow: Arrow = {
          from: origin.square,
          to: target,
          color: origin.color,
        };
        // The same plan can be recolored with a modifier without leaving two
        // arrows directly on top of each other.
        useGameStore.setState({
          arrows: [
            ...existing.filter(
              (item) =>
                item.from !== origin.square || item.to !== target
            ),
            arrow,
          ],
        });
      }
    },
    [boardRef, flipped]
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (pointerIdRef.current !== e.pointerId) return;
      drawOriginRef.current = null;
      pointerIdRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    []
  );

  return { onContextMenu, onPointerDown, onPointerUp, onPointerCancel };
}
