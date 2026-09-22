/**
 * Core chess types used throughout the application.
 */

export type PieceColor = "w" | "b";

export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export type Square =
  | "a1" | "a2" | "a3" | "a4" | "a5" | "a6" | "a7" | "a8"
  | "b1" | "b2" | "b3" | "b4" | "b5" | "b6" | "b7" | "b8"
  | "c1" | "c2" | "c3" | "c4" | "c5" | "c6" | "c7" | "c8"
  | "d1" | "d2" | "d3" | "d4" | "d5" | "d6" | "d7" | "d8"
  | "e1" | "e2" | "e3" | "e4" | "e5" | "e6" | "e7" | "e8"
  | "f1" | "f2" | "f3" | "f4" | "f5" | "f6" | "f7" | "f8"
  | "g1" | "g2" | "g3" | "g4" | "g5" | "g6" | "g7" | "g8"
  | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "h7" | "h8";

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

export interface Move {
  from: Square;
  to: Square;
  color: PieceColor;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  flags: string;
  san: string;
  lan: string;
  before: string;
  after: string;
}

export type MoveQuality =
  | "brilliant"
  | "great"
  | "best"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "book";

export interface MoveAnalysis {
  move: string; // SAN
  fen: string;
  evalBefore: number;
  evalAfter: number;
  bestMove: string;
  altMoves: { move: string; score: number }[];
  quality: MoveQuality;
}

export interface Arrow {
  from: Square;
  to: Square;
  color: "green" | "red" | "yellow" | "blue";
}

export interface CircleHighlight {
  square: Square;
  color: "green" | "red" | "yellow" | "blue";
}

export type GamePhase = "lobby" | "playing" | "ended" | "review";

export interface TimeControl {
  initial: number;
  increment: number;
}

export interface PlayerInfo {
  userId: string;
  username: string;
  avatarUrl?: string | null;
}

export interface GameResult {
  winner: PieceColor | null;
  reason:
    | "checkmate"
    | "resignation"
    | "timeout"
    | "draw_agreement"
    | "stalemate"
    | "insufficient"
    | "threefold"
    | "fifty_moves";
}

// ── Board position helpers ──

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

export function squareToCoords(square: Square): { col: number; row: number } {
  const col = square.charCodeAt(0) - 97; // a=0, h=7
  const row = parseInt(square[1]) - 1;   // 1=0, 8=7
  return { col, row };
}

export function coordsToSquare(col: number, row: number): Square {
  return `${String.fromCharCode(97 + col)}${row + 1}` as Square;
}
