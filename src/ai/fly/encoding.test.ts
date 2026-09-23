import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { decodeMoveIndex, encodeBoard, moverMoveIndex, squareIndex, squareName, SQUARE_FEATURES } from "./encoding";

const feature = (board: ReturnType<typeof encodeBoard>, square: string, plane: number) =>
  board.squares[squareIndex(square as never) * SQUARE_FEATURES + plane];

describe("fly board encoding", () => {
  it("numbers squares a1 = 0 … h8 = 63 and round-trips names", () => {
    expect(squareIndex("a1")).toBe(0);
    expect(squareIndex("h1")).toBe(7);
    expect(squareIndex("a8")).toBe(56);
    expect(squareIndex("h8")).toBe(63);
    for (let i = 0; i < 64; i++) expect(squareIndex(squareName(i))).toBe(i);
  });

  it("encodes the start position from White's side with 20 legal moves", () => {
    const board = encodeBoard(new Chess());
    expect(board.flip).toBe(false);
    expect(board.legal.size).toBe(20);
    expect(feature(board, "e2", 0)).toBe(1); // own pawn
    expect(feature(board, "e1", 5)).toBe(1); // own king
    expect(feature(board, "d8", 6 + 4)).toBe(1); // opponent queen
    expect(feature(board, "e4", 0)).toBe(0);
    // e3 is attacked by White's pawns, e6 by Black's.
    expect(feature(board, "e3", 12)).toBe(1);
    expect(feature(board, "e3", 13)).toBe(0);
    expect(feature(board, "e6", 13)).toBe(1);
    // rights ×4, check, en passant, phase, fifty-move clock, constant, own material ×5, opponent material ×5, balance
    expect(Array.from(board.globals)).toEqual([1, 1, 1, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0]);
    const pieces = board.squares.reduce((sum, value, index) => sum + (index % SQUARE_FEATURES < 12 ? value : 0), 0);
    expect(pieces).toBe(32);
  });

  it("mirrors the board and swaps colours when Black is to move", () => {
    const chess = new Chess();
    chess.move("e4");
    const board = encodeBoard(chess);
    expect(board.flip).toBe(true);
    // Black's e7 pawn appears as an own pawn on e2 of the mover frame.
    expect(feature(board, "e2", 0)).toBe(1);
    // White's e4 pawn appears as an opponent pawn on e5.
    expect(feature(board, "e5", 6)).toBe(1);
    // ...e5 by Black is e2-e4 in the mover frame.
    const index = moverMoveIndex(squareIndex("e7"), squareIndex("e5"), true);
    expect(index).toBe(squareIndex("e2") * 64 + squareIndex("e4"));
    expect(board.legal.get(index)).toBe("e7e5");
    expect(decodeMoveIndex(index, true)).toEqual({ from: "e7", to: "e5" });
  });

  it("senses material from the mover's side", () => {
    // White is a queen up; Black to move feels the deficit.
    const white = encodeBoard(new Chess("4k3/8/8/8/8/8/8/3QK3 w - - 0 1"));
    expect(white.globals[9 + 4]).toBe(1); // own queen
    expect(white.globals[14 + 4]).toBe(0); // no opponent queen
    expect(white.globals[19]).toBeCloseTo(9 / 39, 5);
    const black = encodeBoard(new Chess("4k3/8/8/8/8/8/8/3QK3 b - - 0 1"));
    expect(black.globals[9 + 4]).toBe(0);
    expect(black.globals[14 + 4]).toBe(1);
    expect(black.globals[19]).toBeCloseTo(-9 / 39, 5);
  });

  it("keeps every promotion distinct and flags en passant and check", () => {
    const promotion = encodeBoard(new Chess("8/P7/8/8/8/8/8/k6K w - - 0 1"));
    expect(promotion.legal.get(squareIndex("a7") * 64 + squareIndex("a8"))).toBe("a7a8q");
    for (const kind of ["n", "b", "r"]) {
      const index = moverMoveIndex(squareIndex("a7"), squareIndex("a8"), false, kind);
      expect(promotion.legal.get(index)).toBe(`a7a8${kind}`);
      expect(decodeMoveIndex(index, false)).toEqual({from:"a7",to:"a8",promotion:kind});
    }
    const enPassant = encodeBoard(new Chess("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3"));
    expect(enPassant.globals[5]).toBe(1);
    expect(feature(enPassant,"f6",14)).toBe(1);
    const check = encodeBoard(new Chess("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"));
    expect(check.globals[4]).toBe(1);
    expect(check.legal.size).toBe(0);
  });
});
