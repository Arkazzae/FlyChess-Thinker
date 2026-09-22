import { describe, expect, it } from "vitest";
import { createGame, getLegalMoves, makeMove } from "./chess";

const OPEN_CASTLING_FEN = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
const OPEN_CASTLING_FEN_BLACK_TO_MOVE = "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1";
const NO_WHITE_RIGHTS_FEN = "r3k2r/8/8/8/8/8/8/R3K2R w kq - 0 1";

describe("castling by dragging king onto rook (or rook onto king)", () => {
  it("castles kingside when the king is dropped on its own rook", () => {
    const game = createGame(OPEN_CASTLING_FEN);
    const move = makeMove(game, "e1", "h1");

    expect(move?.san).toBe("O-O");
    expect(game.get("g1")).toMatchObject({ type: "k", color: "w" });
    expect(game.get("f1")).toMatchObject({ type: "r", color: "w" });
  });

  it("castles queenside when the rook is dropped on its own king", () => {
    const game = createGame(OPEN_CASTLING_FEN);
    const move = makeMove(game, "a1", "e1");

    expect(move?.san).toBe("O-O-O");
    expect(game.get("c1")).toMatchObject({ type: "k", color: "w" });
    expect(game.get("d1")).toMatchObject({ type: "r", color: "w" });
  });

  it("works for black too", () => {
    const game = createGame(OPEN_CASTLING_FEN_BLACK_TO_MOVE);
    const move = makeMove(game, "e8", "a8");

    expect(move?.san).toBe("O-O-O");
    expect(game.get("c8")).toMatchObject({ type: "k", color: "b" });
    expect(game.get("d8")).toMatchObject({ type: "r", color: "b" });
  });

  it("refuses the gesture once castling rights are gone", () => {
    const game = createGame(NO_WHITE_RIGHTS_FEN);
    const move = makeMove(game, "e1", "h1");

    expect(move).toBeNull();
  });

  it("surfaces the rook squares as legal targets when the king is selected", () => {
    const game = createGame(OPEN_CASTLING_FEN);
    const targets = getLegalMoves(game, "e1").map((m) => m.to);

    expect(targets).toContain("h1");
    expect(targets).toContain("a1");
    expect(targets).toContain("g1");
    expect(targets).toContain("c1");
  });
});
