/**
 * Board encoding for DROSO-1. Mirrors training/core/encoding.py and the
 * training/droso1/player.py search adapter:
 * the position is always seen from the side to move (Black's positions are
 * mirrored vertically with colours swapped), squares are numbered a1 = 0 …
 * h8 = 63. Normal moves and queen promotions use from * 64 + to; knight,
 * bishop and rook promotions have 72 dedicated action slots.
 */

import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

export const SQUARE_FEATURES = 15;
export const GLOBAL_FEATURES = 22;
export const MOVE_SPACE = 4168;
const PIECE_ORDER: PieceSymbol[] = ["p", "n", "b", "r", "q", "k"];
const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PHASE_MATERIAL = 62;
/** Material sense: piece types counted, their initial counts and the total used to scale the balance. */
const MATERIAL_ORDER: PieceSymbol[] = ["p", "n", "b", "r", "q"];
const MATERIAL_SCALE = [8, 2, 2, 2, 1];
const MATERIAL_TOTAL = 39;
const FILES = "abcdefgh";

export function squareIndex(square: Square): number {
  return (Number(square[1]) - 1) * 8 + FILES.indexOf(square[0]);
}

export function squareName(index: number): Square {
  return `${FILES[index & 7]}${(index >> 3) + 1}` as Square;
}

export function moverSquare(index: number, flip: boolean): number {
  return flip ? index ^ 56 : index;
}

/** Absolute from*64+to → mover frame (and back; the mirror is an involution). */
export function moverMoveIndex(from: number, to: number, flip: boolean, promotion?: string): number {
  const source = moverSquare(from, flip), target = moverSquare(to, flip);
  const kind = ["n", "b", "r"].indexOf(promotion ?? "");
  if (kind >= 0) return 4096 + ((source % 8) * 3 + (target % 8) - (source % 8) + 1) * 3 + kind;
  return source * 64 + target;
}

export interface EncodedBoard {
  /** 64 × 15, square-major, in the mover frame. */
  squares: Float32Array;
  globals: Float32Array;
  flip: boolean;
  /** Legal moves as mover-frame indices → UCI string (all promotions). */
  legal: Map<number, string>;
}

export function encodeBoard(chess: Chess, halfmoveKnown = true): EncodedBoard {
  const mover: Color = chess.turn();
  const opponent: Color = mover === "w" ? "b" : "w";
  const flip = mover === "b";
  const squares = new Float32Array(64 * SQUARE_FEATURES);
  let material = 0;
  const owned: Record<Color, number[]> = { w: [0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0] };
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      const kind = MATERIAL_ORDER.indexOf(cell.type);
      if (kind >= 0) owned[cell.color][kind]++;
      const base = cell.color === mover ? 0 : 6;
      const target = moverSquare(squareIndex(cell.square), flip);
      squares[target * SQUARE_FEATURES + base + PIECE_ORDER.indexOf(cell.type)] = 1;
      if (cell.type !== "p") material += PIECE_VALUES[cell.type];
    }
  }
  for (let index = 0; index < 64; index++) {
    const name = squareName(index);
    const target = moverSquare(index, flip) * SQUARE_FEATURES;
    if (chess.isAttacked(name, mover)) squares[target + 12] = 1;
    if (chess.isAttacked(name, opponent)) squares[target + 13] = 1;
  }
  const legal = new Map<number, string>();
  let enPassant = false;
  for (const move of chess.moves({ verbose: true })) {
    const index = moverMoveIndex(squareIndex(move.from), squareIndex(move.to), flip, move.promotion);
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    legal.set(index, uci);
    if (move.flags.includes("e")) enPassant = true;
  }
  const rights = chess.getCastlingRights(mover);
  const theirRights = chess.getCastlingRights(opponent);
  const fen = chess.fen().split(" ");
  if (enPassant) squares[moverSquare(squareIndex(fen[3] as Square), flip) * SQUARE_FEATURES + 14] = 1;
  const halfmove = Number(fen[4] ?? 0);
  // Interoception rather than vision: what each side still owns and the signed balance.
  const mine = owned[mover];
  const theirs = owned[opponent];
  let balance = 0;
  for (let k = 0; k < MATERIAL_ORDER.length; k++) balance += (mine[k] - theirs[k]) * PIECE_VALUES[MATERIAL_ORDER[k]];
  const globals = Float32Array.from([
    Number(rights.k), Number(rights.q), Number(theirRights.k), Number(theirRights.q),
    Number(chess.inCheck()), Number(enPassant), Math.min(1, material / PHASE_MATERIAL),
    halfmoveKnown ? Math.min(1, halfmove / 100) : 0, 1,
    ...mine.map((count, k) => Math.min(1.5, count / MATERIAL_SCALE[k])),
    ...theirs.map((count, k) => Math.min(1.5, count / MATERIAL_SCALE[k])),
    Math.max(-1, Math.min(1, balance / MATERIAL_TOTAL)),
    Number(halfmoveKnown), 0, // Matches encode_search: repetition history is not a neural input.
  ]);
  return { squares, globals, flip, legal };
}

export function encodeFen(fen: string): EncodedBoard {
  return encodeBoard(new Chess(fen));
}

/** Decode a mover-frame move index into board squares (absolute). */
export function decodeMoveIndex(index: number, flip: boolean): { from: Square; to: Square; promotion?: string } {
  if (index >= 4096) {
    const action = index - 4096, geometry = Math.floor(action / 3);
    const file = Math.floor(geometry / 3), direction = geometry % 3 - 1;
    return { from: squareName(moverSquare(48 + file, flip)), to: squareName(moverSquare(56 + file + direction, flip)), promotion: ["n", "b", "r"][action % 3] };
  }
  const from = moverSquare(Math.floor(index / 64), flip);
  const to = moverSquare(index % 64, flip);
  return { from: squareName(from), to: squareName(to) };
}
