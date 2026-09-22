import { describe, expect, it } from "vitest";
import { getBotMoveDelay } from "./bot-timing";

// Only `elo` drives timing; these stand in for the removed bot roster.
const mario = { elo: 400 };
const kratos = { elo: 2200 };

function randomSequence(...values: number[]): () => number {
  return () => values.shift() ?? 0;
}

describe("bot clock management", () => {
  it("occasionally gives an easy bot a visible thinking pause", () => {
    const delay = getBotMoveDelay({
      bot: mario,
      baseDelayMs: 300,
      remainingMs: 240_000,
      timeControl: { initial: 300, increment: 0 },
      halfMoves: 18,
      random: randomSequence(0.1, 0.5),
    });

    expect(delay).toBeGreaterThan(2_000);
  });

  it("keeps most moves quick when the hesitation roll does not trigger", () => {
    const delay = getBotMoveDelay({
      bot: mario,
      baseDelayMs: 300,
      remainingMs: 240_000,
      timeControl: { initial: 300, increment: 0 },
      halfMoves: 18,
      random: () => 0.9,
    });

    expect(delay).toBe(300);
  });

  it("scales the same hesitation down in bullet games", () => {
    const bullet = getBotMoveDelay({
      bot: mario,
      baseDelayMs: 300,
      remainingMs: 50_000,
      timeControl: { initial: 60, increment: 0 },
      halfMoves: 18,
      random: randomSequence(0.1, 0.5),
    });
    const rapid = getBotMoveDelay({
      bot: mario,
      baseDelayMs: 300,
      remainingMs: 500_000,
      timeControl: { initial: 600, increment: 0 },
      halfMoves: 18,
      random: randomSequence(0.1, 0.5),
    });

    expect(bullet).toBeLessThan(rapid);
  });

  it("does not add a hesitation at critical clock time", () => {
    const delay = getBotMoveDelay({
      bot: mario,
      baseDelayMs: 900,
      remainingMs: 600,
      timeControl: { initial: 60, increment: 0 },
      halfMoves: 30,
      random: () => 0,
    });

    expect(delay).toBe(0);
  });

  it("preserves the existing personality delay in unlimited games", () => {
    const delay = getBotMoveDelay({
      bot: kratos,
      baseDelayMs: 640,
      remainingMs: 0,
      timeControl: { initial: 0, increment: 0 },
      halfMoves: 20,
      random: () => 0,
    });

    expect(delay).toBe(640);
  });
});
