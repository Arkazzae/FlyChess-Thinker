/**
 * Bot controller. There is one opponent and one move source: the trained
 * DROSO-1 FlyWire connectome model in src/ai/fly. If the brain cannot be loaded there
 * is no fallback engine — the caller surfaces the failure instead.
 */

import { getBot, type BotDefinition } from "./bots";
import { getFlyLevel, type FlyLevelId } from "./bots/levels";
import { getFlyEngine } from "./fly/engine";
import { valueToCentipawns } from "./fly/planner";
import type { PieceColor } from "@/engine/types";

export interface BotMoveDecision {
  move: string;
  thinkTime: number;
  /** Evaluation before the bot move, from White's perspective. */
  positionEvaluation: number | null;
  /** Evaluation of the selected candidate, from White's perspective. */
  selectedEvaluation: number | null;
}

/** Thinking time for the Fly: generous without a clock, a slice of the remaining time with one. */
export function getFlyThinkingBudget(remainingMs: number | null, halfMoves: number): number {
  if (remainingMs === null) return halfMoves < 6 ? 1800 : 3500;
  return Math.round(Math.max(350, Math.min(5000, remainingMs / 35)));
}

export class BotController {
  private bot: BotDefinition | null = null;
  private initialized = false;
  private level: FlyLevelId = "thinker";

  setLevel(level: FlyLevelId): void {
    this.level = level;
  }

  async init(botId?: string): Promise<void> {
    if (this.initialized) return;
    const bot = getBot(botId ?? "fly");
    if (!bot) throw new Error(`Unknown bot: ${botId}`);
    await getFlyEngine().init();
    this.initialized = true;
  }

  startGame(botId: string, _color: PieceColor): void {
    const bot = getBot(botId);
    if (!bot) throw new Error(`Unknown bot: ${botId}`);
    this.bot = bot;
  }

  /**
   * Complete the selected PUCT budget in untimed games; respect the clock in timed games.
   */
  async getMove(
    fen: string,
    halfMoves: number,
    _evalScore = 0,
    /** Bot's remaining clock time; null when the game is untimed. */
    remainingMs: number | null = null,
    /** Position counts of the game so far: the fly's memory against repeating itself. */
    seen?: Record<string, number>
  ): Promise<BotMoveDecision> {
    if (!this.bot || !this.initialized) {
      throw new Error("Bot controller not initialized");
    }

    const bot = this.bot;
    const startedAt = performance.now();
    const level = getFlyLevel(this.level);
    const budgetMs = getFlyThinkingBudget(remainingMs, halfMoves);
    // Zero temperature selects by visit count and prior throughout the game.
    const { decision } = await getFlyEngine().think(fen, {
      ...level.plan,
      temperature: 0,
      budgetMs: remainingMs === null ? undefined : budgetMs,
      seen,
    });
    const elapsed = performance.now() - startedAt;
    const toWhite = fen.split(" ")[1] === "w" ? 1 : -1;
    const chosen = decision.candidates.find((candidate) => candidate.uci === decision.move);

    return {
      move: decision.move,
      // The thinking itself is the pause; only top up when the brain answered instantly (forced move, cache).
      thinkTime: Math.max(60, Math.round(Math.min(bot.thinkDelay, budgetMs) * 0.5 - elapsed)),
      positionEvaluation: valueToCentipawns(decision.value[0]) * toWhite,
      selectedEvaluation: chosen ? valueToCentipawns(chosen.value) * toWhite : null,
    };
  }

  getBotInfo(): BotDefinition | null {
    return this.bot;
  }

  stop(): void {
    // The connectome worker finishes its current thought on its own.
  }

  destroy(): void {
    // The fly brain is shared for the whole session (large download); nothing is per game.
    this.bot = null;
    this.initialized = false;
  }
}
