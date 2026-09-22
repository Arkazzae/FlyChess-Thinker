/**
 * Chess.js wrapper with typed interface.
 * Single source of truth for game rules and move validation.
 */

import { Chess } from "chess.js";
import type { Square, Move, PieceColor, Piece } from "./types";

export type { Chess };

export function createGame(fen?: string): Chess {
  return fen ? new Chess(fen) : new Chess();
}

export function getLegalMoves(game: Chess, square?: Square): Move[] {
  const opts = square ? { square, verbose: true } : { verbose: true };
  const moves = game.moves(opts) as unknown as Move[];
  if (!square) return moves;

  // Surface castling as a king → rook target too, so the rook's square
  // highlights as legal and clicking/dragging the king onto it also castles.
  const castlingMoves = moves.filter((m) => m.flags.includes("k") || m.flags.includes("q"));
  if (castlingMoves.length === 0) return moves;

  const extra = castlingMoves.map((m) => ({
    ...m,
    to: `${m.flags.includes("k") ? "h" : "a"}${square[1]}` as Square,
  }));
  return [...moves, ...extra];
}

/**
 * Detects the "grab the king and drop it on its own rook" (or vice versa)
 * castling gesture and resolves it to the king's real destination square.
 */
function resolveCastlingIntent(game: Chess, from: Square, to: Square): { from: Square; to: Square } | null {
  const fromPiece = game.get(from);
  const toPiece = game.get(to);
  if (!fromPiece || !toPiece || fromPiece.color !== toPiece.color) return null;

  let kingSquare: Square | null = null;
  let rookSquare: Square | null = null;
  if (fromPiece.type === "k" && toPiece.type === "r") {
    kingSquare = from;
    rookSquare = to;
  } else if (fromPiece.type === "r" && toPiece.type === "k") {
    kingSquare = to;
    rookSquare = from;
  } else {
    return null;
  }

  const isKingside = rookSquare[0] > kingSquare[0];
  const targetFile = isKingside ? "g" : "c";
  return { from: kingSquare, to: `${targetFile}${kingSquare[1]}` as Square };
}

export function makeMove(
  game: Chess,
  from: Square,
  to: Square,
  promotion?: string
): Move | null {
  try {
    return game.move({ from, to, promotion }) as unknown as Move;
  } catch {
    const castling = resolveCastlingIntent(game, from, to);
    if (!castling) return null;
    try {
      return game.move({ from: castling.from, to: castling.to }) as unknown as Move;
    } catch {
      return null;
    }
  }
}

export function getPiece(game: Chess, square: Square): Piece | null {
  const p = game.get(square);
  return p ? { type: p.type, color: p.color } : null;
}

export function isCheck(game: Chess): boolean {
  return game.isCheck();
}

export function isCheckmate(game: Chess): boolean {
  return game.isCheckmate();
}

export function isStalemate(game: Chess): boolean {
  return game.isStalemate();
}

export function isDraw(game: Chess): boolean {
  return game.isDraw();
}

export function isInsufficientMaterial(game: Chess): boolean {
  return game.isInsufficientMaterial();
}

export function isThreefoldRepetition(game: Chess): boolean {
  return game.isThreefoldRepetition();
}

export function isDrawByFiftyMoves(game: Chess): boolean {
  return game.isDrawByFiftyMoves();
}

export function isGameOver(game: Chess): boolean {
  return game.isGameOver();
}

export function getTurn(game: Chess): PieceColor {
  return game.turn() as PieceColor;
}

export function getFen(game: Chess): string {
  return game.fen();
}

export function getPgn(game: Chess): string {
  return game.pgn();
}

export function getHistory(game: Chess): string[] {
  return game.history();
}

export function getMoveNumber(game: Chess): number {
  return game.moveNumber();
}

const MATERIAL_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
} as const;

/** Fast material-only evaluation in centipawns from White's perspective. */
export function evaluateMaterial(game: Chess): number {
  let score = 0;
  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const value = MATERIAL_VALUES[piece.type];
      score += piece.color === "w" ? value : -value;
    }
  }
  return score;
}

/**
 * Get all pieces on the board.
 */
export function getBoard(game: Chess): (Piece | null)[][] {
  return game.board().map((row) =>
    row.map((sq) => (sq ? { type: sq.type, color: sq.color } : null))
  );
}

/**
 * Detect captured pieces from move history.
 */
export function getCapturedPieces(game: Chess): {
  w: string[];
  b: string[];
} {
  const captured: { w: string[]; b: string[] } = { w: [], b: [] };
  const moves = game.history({ verbose: true }) as unknown as Move[];
  for (const m of moves) {
    if (m.captured) {
      // The capturing side's opponent lost the piece
      const loser = m.color === "w" ? "b" : "w";
      captured[loser].push(m.captured);
    }
  }
  return captured;
}
