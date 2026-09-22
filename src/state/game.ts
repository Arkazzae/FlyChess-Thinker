/**
 * Core game state store (Zustand).
 * Single source of truth for the chess game.
 */

import { create } from "zustand";
import { Chess } from "chess.js";
import type {
  Square,
  PieceColor,
  PieceType,
  Move,
  Arrow,
  CircleHighlight,
  GamePhase,
  GameResult,
  TimeControl,
  PlayerInfo,
} from "@/engine/types";
import {
  createClock,
  isUnlimited,
  startClock,
  stopClock,
  switchClock,
  type ClockState,
} from "@/engine/clock";
import * as ChessEngine from "@/engine/chess";

export interface GameState {
  // ── Core ──
  chess: Chess;
  phase: GamePhase;
  fen: string;
  moves: string[]; // SAN history
  lastMove: { from: Square; to: Square } | null;
  capturedPieces: Record<PieceColor, PieceType[]>;

  // ── Players ──
  players: { w: PlayerInfo | null; b: PlayerInfo | null };
  myColor: PieceColor | null; // null = spectator
  botId: string | null;
  onlineGameId: string | null;

  // ── Clock ──
  clock: ClockState;
  timeControl: TimeControl;

  // ── Game end ──
  result: GameResult | null;
  drawOffer: string | null; // userId who offered

  // ── Board interaction ──
  selectedSquare: Square | null;
  legalMoves: Square[];
  premove: { from: Square; to: Square; promotion?: string } | null;
  arrows: Arrow[];
  circles: CircleHighlight[];
  flipped: boolean;

  // ── UI ──
  promotionPending: { from: Square; to: Square } | null;
  /** The fly's own evaluation after its last move, in centipawns from White. */
  evaluation: number | null;
  /** Half-move shown on the board while browsing the move list; null = the live position. */
  viewPly: number | null;

  // ── Actions ──
  newGame: (opts: {
    timeControl: TimeControl;
    myColor: PieceColor | null;
    players: { w: PlayerInfo | null; b: PlayerInfo | null };
    botId?: string | null;
  }) => void;
  loadPosition: (
    fen: string,
    moves: string[],
    capturedPieces?: Record<PieceColor, PieceType[]>,
  ) => void;
  selectSquare: (square: Square | null) => void;
  tryMove: (from: Square, to: Square) => Move | "promotion" | null;
  confirmPromotion: (piece: string) => Move | null;
  cancelPromotion: () => void;
  applyMove: (move: Move) => void;
  setPremove: (premove: { from: Square; to: Square; promotion?: string } | null) => void;
  setEvaluation: (evaluation: number | null) => void;
  setResult: (result: GameResult) => void;
  setDrawOffer: (userId: string | null) => void;
  tickClock: () => void;
  flipBoard: () => void;
  setArrows: (arrows: Arrow[]) => void;
  setCircles: (circles: CircleHighlight[]) => void;
  clearAnnotations: () => void;
  setPhase: (phase: GamePhase) => void;
  /** Take back moves until it is the player's turn again (one full move against the bot). */
  takeback: () => number;
  setViewPly: (ply: number | null) => void;
  reset: () => void;

}

const DEFAULT_TC: TimeControl = { initial: 0, increment: 0 };

export const useGameStore = create<GameState>((set, get) => ({
  // ── Initial state ──
  chess: new Chess(),
  phase: "lobby",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  moves: [],
  lastMove: null,
  capturedPieces: { w: [], b: [] },
  players: { w: null, b: null },
  myColor: null,
  botId: null,
  onlineGameId: null,
  clock: createClock(DEFAULT_TC),
  timeControl: DEFAULT_TC,
  result: null,
  drawOffer: null,
  selectedSquare: null,
  legalMoves: [],
  premove: null,
  arrows: [],
  circles: [],
  flipped: false,
  promotionPending: null,
  evaluation: null,
  viewPly: null,

  // ── Actions ──

  newGame: ({ timeControl, myColor, players, botId }) => {
    const chess = new Chess();
    set({
      chess,
      phase: "playing",
      fen: chess.fen(),
      moves: [],
      lastMove: null,
      capturedPieces: { w: [], b: [] },
      players,
      myColor,
      botId: botId ?? null,
      onlineGameId: null,
      clock: createClock(timeControl),
      timeControl,
      result: null,
      drawOffer: null,
      selectedSquare: null,
      legalMoves: [],
      premove: null,
      arrows: [],
      circles: [],
      flipped: myColor === "b",
      promotionPending: null,
      evaluation: null,
      viewPly: null,
    });
  },

  loadPosition: (_fen, moves, _savedCapturedPieces) => {
    const chess = new Chess();
    const validMoves: string[] = [];
    const capturedPieces: Record<PieceColor, PieceType[]> = { w: [], b: [] };

    for (const san of moves) {
      try {
        const result = chess.move(san);
        if (!result) break;
        validMoves.push(san);
        if (result.captured) {
          const loser: PieceColor = result.color === "w" ? "b" : "w";
          capturedPieces[loser].push(result.captured as PieceType);
        }
      } catch {
        console.error(`loadPosition: invalid move "${san}" at position ${chess.fen()}`);
        break;
      }
    }

    set({
      chess,
      fen: chess.fen(),
      moves: validMoves,
      capturedPieces,
    });
  },

  selectSquare: (square) => {
    const {
      chess,
      myColor,
      phase,
      selectedSquare: prevSelected,
    } = get();
    if (phase !== "playing") return;

    if (!square) {
      set({ selectedSquare: null, legalMoves: [] });
      return;
    }

    const turn = ChessEngine.getTurn(chess);

    // Off-turn: premove territory
    if (myColor && turn !== myColor) {
      const piece = ChessEngine.getPiece(chess, square);
      if (piece?.color === myColor) {
        // Clicking another own piece changes the premove origin. Clicking the
        // selected origin again cancels the selection.
        set({
          selectedSquare: prevSelected === square ? null : square,
          legalMoves: [],
        });
      } else if (prevSelected) {
        const originPiece = ChessEngine.getPiece(chess, prevSelected);
        const promotion =
          originPiece?.type === "p" && (square[1] === "1" || square[1] === "8")
            ? "q"
            : undefined;
        set({
          premove: { from: prevSelected, to: square, promotion },
          selectedSquare: null,
          legalMoves: [],
        });
      } else {
        set({ selectedSquare: null, legalMoves: [], premove: null });
      }
      return;
    }

    const piece = ChessEngine.getPiece(chess, square);
    if (piece && piece.color === turn) {
      const legal = ChessEngine.getLegalMoves(chess, square);
      set({
        selectedSquare: square,
        legalMoves: legal.map((m) => m.to),
      });
    } else {
      set({ selectedSquare: null, legalMoves: [] });
    }
  },

  tryMove: (from, to) => {
    const { chess, myColor } = get();
    const turn = ChessEngine.getTurn(chess);
    if (myColor && turn !== myColor) return null;

    // Check if promotion
    const piece = ChessEngine.getPiece(chess, from);
    if (
      piece?.type === "p" &&
      ((piece.color === "w" && to[1] === "8") ||
        (piece.color === "b" && to[1] === "1"))
    ) {
      set({ promotionPending: { from, to } });
      return "promotion";
    }

    const move = ChessEngine.makeMove(chess, from, to);
    if (!move) return null;

    get().applyMove(move);

    return move;
  },

  confirmPromotion: (piece) => {
    const { chess, promotionPending } = get();
    if (!promotionPending) return null;

    const move = ChessEngine.makeMove(
      chess,
      promotionPending.from,
      promotionPending.to,
      piece
    );
    if (!move) {
      set({ promotionPending: null });
      return null;
    }

    get().applyMove(move);

    return move;
  },

  cancelPromotion: () => set({ promotionPending: null }),

  applyMove: (move) => {
    const state = get();
    const { chess } = state;
    const nextMoves = [...state.moves, move.san];
    const capturedPieces = {
      w: [...state.capturedPieces.w],
      b: [...state.capturedPieces.b],
    };
    if (move.captured) {
      const loser: PieceColor = move.color === "w" ? "b" : "w";
      capturedPieces[loser].push(move.captured);
    }
    let nextClock = state.clock;

    if (!isUnlimited(state.timeControl)) {
      nextClock = nextClock.running
        ? switchClock(nextClock, state.timeControl.increment)
        : startClock(nextClock, chess.turn() as PieceColor);
    }

    set({
      fen: chess.fen(),
      moves: nextMoves,
      lastMove: { from: move.from as Square, to: move.to as Square },
      capturedPieces,
      clock: nextClock,
      selectedSquare: null,
      legalMoves: [],
      premove:
        state.premove && state.myColor && move.color !== state.myColor
          ? state.premove
          : null,
      promotionPending: null,
      arrows: [],
      circles: [],
      viewPly: null,
    });
  },

  setPremove: (premove) => set({ premove }),

  setEvaluation: (evaluation) => set({ evaluation }),

  setResult: (result) => {
    const state = get();
    set({
      result,
      phase: "ended",
      clock: stopClock(state.clock),
    });
  },

  setDrawOffer: (userId) => set({ drawOffer: userId }),

  tickClock: () => {
    const { clock } = get();
    if (!clock.running) return;
    // Just trigger re-render; actual time is computed in getTimeRemaining
    set({ clock: { ...clock } });
  },

  flipBoard: () => set({ flipped: !get().flipped }),

  setArrows: (arrows) => set({ arrows }),
  setCircles: (circles) => set({ circles }),
  clearAnnotations: () => set({ arrows: [], circles: [] }),

  setPhase: (phase) => set({ phase }),

  takeback: () => {
    const { chess, myColor, phase } = get();
    if (phase !== "playing" || !myColor) return 0;
    let undone = 0;
    while (chess.history().length > 0 && (undone === 0 || chess.turn() !== myColor)) {
      chess.undo();
      undone++;
    }
    if (!undone) return 0;
    const history = chess.history({ verbose: true });
    const capturedPieces: Record<PieceColor, PieceType[]> = { w: [], b: [] };
    for (const move of history) if (move.captured) capturedPieces[move.color === "w" ? "b" : "w"].push(move.captured as PieceType);
    const last = history.at(-1);
    set({
      fen: chess.fen(),
      moves: history.map((move) => move.san),
      lastMove: last ? { from: last.from as Square, to: last.to as Square } : null,
      capturedPieces,
      selectedSquare: null,
      legalMoves: [],
      premove: null,
      promotionPending: null,
      arrows: [],
      circles: [],
      viewPly: null,
    });
    return undone;
  },

  setViewPly: (ply) => {
    const total = get().moves.length;
    set({ viewPly: ply === null || ply >= total ? null : Math.max(0, ply), selectedSquare: null, legalMoves: [] });
  },

  reset: () => {
    set({
      chess: new Chess(),
      phase: "lobby",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      moves: [],
      lastMove: null,
      capturedPieces: { w: [], b: [] },
      players: { w: null, b: null },
      myColor: null,
      botId: null,
      onlineGameId: null,
      clock: createClock(DEFAULT_TC),
      timeControl: DEFAULT_TC,
      result: null,
      drawOffer: null,
      selectedSquare: null,
      legalMoves: [],
      premove: null,
      arrows: [],
      circles: [],
      promotionPending: null,
      evaluation: null,
      viewPly: null,
    });
  },
}));
