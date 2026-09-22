import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import type { BrainOutput } from "./brain";
import { encodeBoard, moverMoveIndex, squareIndex, type EncodedBoard } from "./encoding";
import { forcingMoves, plan, positionKey, rankLegalMoves, seenPositions, valueToCentipawns, type Evaluator } from "./planner";

function output(logits: Record<number, number>, value = 0): BrainOutput {
  const policy = new Float32Array(4096).fill(-8);
  for (const [index, logit] of Object.entries(logits)) policy[Number(index)] = logit;
  return { policy, reply: new Float32Array(4096), value: Float32Array.from([value, value, value]), groups: new Float32Array(6) };
}
const idx = (from: string, to: string, flip = false) => moverMoveIndex(squareIndex(from as never), squareIndex(to as never), flip);
/** Key the fake brain by piece placement + side to move. */
const key = (board: EncodedBoard) => Array.from(board.squares).join("") + (board.flip ? "b" : "w");

describe("fly planner", () => {
  it("measures how much raw instinct lands on legal moves", () => {
    const chess = new Chess();
    const illegal = idx("a1", "h8");
    const ranked = rankLegalMoves(output({ [idx("e2", "e4")]: 2.5, [illegal]: 2 }), require_board(chess));
    expect(ranked.ranked[0].uci).toBe("e2e4");
    expect(ranked.legalMass).toBeGreaterThan(0.3);
    expect(ranked.legalMass).toBeLessThan(0.7);
    expect(ranked.rawChoiceLegal).toBe(true);
    const confused = rankLegalMoves(output({ [illegal]: 9 }), require_board(chess));
    expect(confused.rawChoiceLegal).toBe(false);
    expect(confused.ranked.length).toBe(20);
  });

  it("never returns an illegal move even when the policy prefers one", async () => {
    const chess = new Chess();
    const decision = await plan(chess, () => output({ [idx("a1", "h8")]: 12 }), { candidates: 1, replies: 0, priorWeight: 0.25, temperature: 0 });
    expect(chess.moves({ verbose: true }).some((m) => `${m.from}${m.to}` === decision.move)).toBe(true);
    expect(decision.rawChoiceLegal).toBe(false);
  });

  it("plays a mate in one even when instinct ranks it second", async () => {
    const chess = new Chess("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1");
    const evaluate: Evaluator = () => output({ [idx("g2", "g3")]: 3, [idx("d1", "d8")]: 2 }, -0.2);
    const decision = await plan(chess, evaluate, { candidates: 3, replies: 2, priorWeight: 0.25, temperature: 0 });
    expect(decision.move).toBe("d1d8");
    expect(decision.candidates[0].value).toBe(1);
  });

  it("accepts less now for more later: the sacrifice wins when the future is better", async () => {
    // White can grab a pawn (Nxe5) or play the quiet Bc4. Instinct loves the capture.
    const chess = new Chess("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3");
    const root = require_board(chess);
    const grab = new Chess(chess.fen());
    grab.move("Nxe5");
    const quiet = new Chess(chess.fen());
    quiet.move("Bc4");
    const grabKey = key(require_board(grab));
    const quietKey = key(require_board(quiet));
    const evaluate: Evaluator = (board) => {
      const k = key(board);
      if (k === key(root)) return output({ [idx("f3", "e5")]: 4, [idx("f1", "c4")]: 2 }, 0);
      // Values are from the side to move (Black) after White's move.
      if (k === grabKey) return output({}, 0.6); // Black is happy after the greedy capture
      if (k === quietKey) return output({}, -0.3); // Black is worse after the quiet move
      // Grandchildren: White to move again. Worse after the grab, fine after the quiet move.
      return output({}, board.squares[squareIndex("e5") * 14 + 1] ? -0.6 : 0.3);
    };
    const decision = await plan(chess, evaluate, { candidates: 2, replies: 2, priorWeight: 0.1, temperature: 0 });
    expect(decision.move).toBe("f1c4");
    const greedy = decision.candidates.find((c) => c.uci === "f3e5")!;
    expect(greedy.prior).toBeGreaterThan(0.5); // instinct preferred it
    expect(greedy.value).toBeLessThan(0); // foresight rejected it
    expect(decision.evaluations).toBeGreaterThan(3);
  });

  it("policy-only mode decodes the expected reply in the mover frame", async () => {
    const chess = new Chess();
    chess.move("e4");
    const reply = new Float32Array(4096);
    // Trained in Black's (mirrored) frame: White's g1-f3 appears as g8-f6.
    reply[idx("g1", "f3", true)] = 5;
    const evaluate: Evaluator = () => ({ ...output({ [idx("e7", "e5", true)]: 5 }), reply });
    const decision = await plan(chess, evaluate, { candidates: 1, replies: 0, priorWeight: 0, temperature: 0 });
    expect(decision.move).toBe("e7e5");
    expect(decision.candidates[0].expectedReply).toBe("g1f3");
  });

  describe("thinking with a time budget", () => {
    // Doubled rooks: 1.Re8+ Rxe8 2.Rxe8# — but instinct prefers the quiet g3 and every static value is neutral.
    const fen = "r5k1/5ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1";
    const blindBrain = (clock: { t: number }, cost = 10): Evaluator => () => {
      clock.t += cost;
      return output({ [idx("g2", "g3")]: 3, [idx("e2", "e8")]: 2.5, [idx("e1", "e8")]: 4 }, 0);
    };

    it("thinking deeper finds the mate that a shallow look misses", async () => {
      const clock = { t: 0 };
      const seen: { depth: number; move: string; evaluations: number }[] = [];
      const decision = await plan(new Chess(fen), blindBrain(clock), {
        candidates: 3, replies: 2, priorWeight: 0.25, temperature: 0, budgetMs: 100_000, stages: [[3, 2], [3, 2, 2]], now: () => clock.t,
        onStage: (d) => seen.push({ depth: d.depth, move: d.move, evaluations: d.evaluations }),
      });
      expect(seen.map((s) => s.depth)).toEqual([2, 3]);
      expect(seen[0].move).toBe("g2g3"); // two half-moves ahead the sacrifice looks pointless
      expect(decision.move).toBe("e2e8"); // three half-moves ahead it is mate
      expect(decision.line).toEqual(["Re8+", "Rxe8", "Rxe8#"]);
      expect(decision.stages).toBe(2);
      expect(decision.candidates[0].value).toBeGreaterThan(0.4);
      // Positions imagined in the first stage are not evaluated again.
      expect(seen[1].evaluations).toBeGreaterThan(seen[0].evaluations);
      expect(decision.evaluations).toBe(clock.t / 10);
    });

    it("always finishes the first stage and stops when the budget is spent", async () => {
      const clock = { t: 0 };
      let stages = 0;
      const decision = await plan(new Chess(fen), blindBrain(clock), {
        candidates: 3, replies: 2, priorWeight: 0.25, temperature: 0, budgetMs: 25, stages: [[3, 2], [3, 2, 2], [4, 3, 2, 2]], now: () => clock.t,
        onStage: () => { stages++; },
      });
      expect(stages).toBe(1);
      expect(decision.stages).toBe(1);
      expect(decision.depth).toBe(2);
      expect(decision.move).toBe("g2g3");
    });

    it("does not deliberate over a forced move", async () => {
      const clock = { t: 0 };
      const forced = new Chess("r3R1k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1"); // in check, only Rxe8 is legal
      let stages = 0;
      const decision = await plan(forced, blindBrain(clock), {
        candidates: 3, replies: 2, priorWeight: 0.25, temperature: 0, budgetMs: 100_000, now: () => clock.t, onStage: () => { stages++; },
      });
      expect(forced.moves().length).toBe(1);
      expect(stages).toBe(1);
      expect(decision.move).toBe("a8e8");
    });
  });

  describe("habits of a thinking player", () => {
    it("remembers the game: avoids a repetition when ahead and takes it when behind", async () => {
      const fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
      const repeated = new Chess(fen);
      repeated.move("e4");
      const seen = { [positionKey(repeated.fen())]: 1 };
      // Instinct prefers e4 both times; only the judgement of the other move changes.
      const brain = (childValue: number): Evaluator => (board) =>
        output({ [idx("e2", "e4")]: 3, [idx("e2", "e3")]: 2.5 }, board.flip ? childValue : 0);
      const options = { candidates: 2, replies: 0, priorWeight: 0.25, temperature: 0, seen };
      const ahead = await plan(new Chess(fen), brain(-0.4), options);
      expect(ahead.move).toBe("e2e3"); // e4 would repeat a position: worth a draw, and we are better than that
      expect(ahead.candidates.find((c) => c.uci === "e2e4")!.value).toBeCloseTo(0, 9);
      const behind = await plan(new Chess(fen), brain(0.4), options);
      expect(behind.move).toBe("e2e4"); // losing otherwise, so the repetition is welcome
      const forgetful = await plan(new Chess(fen), brain(-0.4), { ...options, seen: undefined });
      expect(forgetful.move).toBe("e2e4");
    });

    it("counts positions from a game's history", () => {
      const game = new Chess();
      for (const san of ["Nf3", "Nf6", "Ng1", "Ng8"]) game.move(san);
      const seen = seenPositions(game.history({ verbose: true }), game.fen());
      expect(seen[positionKey(new Chess().fen())]).toBe(2); // start position reached again
      expect(Object.values(seen).reduce((a, b) => a + b, 0)).toBe(5);
      expect(seenPositions([], new Chess().fen())[positionKey(new Chess().fen())]).toBe(1);
    });

    it("always imagines captures that win material, even when instinct ignores them", async () => {
      // Black's queen hangs on d5. Instinct only proposes pawn moves; the value is plain material sense.
      const fen = "4k3/pp6/8/3q4/8/2N5/PP6/4K3 w - - 0 1";
      expect(forcingMoves(new Chess(fen), 2)).toEqual(["c3d5"]);
      const brain: Evaluator = (board) =>
        output({ [idx("a2", "a3")]: 3, [idx("b2", "b3")]: 2.5 }, Math.max(-0.9, Math.min(0.9, board.globals[19] * 3)));
      const base = { candidates: 2, replies: 1, priorWeight: 0.25, temperature: 0 };
      const thinking = await plan(new Chess(fen), brain, base);
      expect(thinking.move).toBe("c3d5");
      expect(thinking.candidates.map((c) => c.uci)).toContain("c3d5");
      const instinctBound = await plan(new Chess(fen), brain, { ...base, forcing: 0 });
      expect(instinctBound.move).not.toBe("c3d5");
    });

    it("does not call a defended pawn grab or an even trade forcing", () => {
      // Rook takes a defended knight (3 - 5 < 2) is not forcing; pawn takes knight (3 - 1) is.
      const position = new Chess("4k3/8/2p5/3n4/4P3/8/8/3RK3 w - - 0 1");
      expect(forcingMoves(position, 4)).toEqual(["e4d5"]);
    });
  });

  it("maps values to the centipawn scale used in training", () => {
    expect(valueToCentipawns(0)).toBe(0);
    expect(valueToCentipawns(Math.tanh(300 / 600))).toBe(300);
    expect(valueToCentipawns(1)).toBeLessThan(3000);
    expect(valueToCentipawns(-1)).toBeGreaterThan(-3000);
  });
});

function require_board(chess: Chess): EncodedBoard {
  return encodeBoard(chess);
}
