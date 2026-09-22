/**
 * Human-like clock management for bot games.
 *
 * Engine search already contributes to the time spent on a move. This module
 * only decides how long the bot should keep the move "in hand" afterwards.
 * Weaker bots hesitate more often, while every bot speeds up in short time
 * controls and when its clock is running low.
 */

import type { BotDefinition } from "./bots/types";
import type { TimeControl } from "@/engine/types";
/** Injectable RNG so timing can be tested deterministically. */
export type RandomSource = () => number;

interface BotTimingOptions {
  bot: Pick<BotDefinition, "elo">;
  /** Delay still requested by the move-selection policy after engine search. */
  baseDelayMs: number;
  /** Live clock value after engine search, in milliseconds. */
  remainingMs: number;
  timeControl: TimeControl;
  halfMoves: number;
  random?: RandomSource;
}

const HESITATION_CHANCE = [
  [700, 0.42],
  [1200, 0.28],
  [1600, 0.18],
  [1900, 0.12],
  [Number.POSITIVE_INFINITY, 0.08],
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getHesitationChance(elo: number): number {
  return HESITATION_CHANCE.find(([limit]) => elo <= limit)?.[1] ?? 0.08;
}

function getTimeControlFactor(initialSeconds: number): number {
  if (initialSeconds <= 60) return 0.35;
  if (initialSeconds <= 120) return 0.5;
  if (initialSeconds <= 180) return 0.65;
  if (initialSeconds <= 300) return 0.85;
  if (initialSeconds <= 600) return 1;
  return 1.15;
}

/**
 * Return the post-search delay for a bot move.
 *
 * In an untimed game the existing personality delay is preserved. In timed
 * games an easy bot will occasionally pause for a few seconds, but the delay
 * is always capped so it cannot deliberately burn the final clock reserve.
 */
export function getBotMoveDelay({
  bot,
  baseDelayMs,
  remainingMs,
  timeControl,
  halfMoves,
  random = Math.random,
}: BotTimingOptions): number {
  const baseDelay = Math.max(0, Math.round(baseDelayMs));
  const unlimited = timeControl.initial === 0 && timeControl.increment === 0;
  if (unlimited) return baseDelay;

  const initialMs = timeControl.initial * 1000;
  const safeRemaining = Math.max(0, remainingMs);
  const reserveMs = clamp(initialMs * 0.01, 350, 1500);
  const maximumDelay = Math.max(0, safeRemaining - reserveMs);
  const cappedBaseDelay = Math.min(baseDelay, maximumDelay);

  // Under severe time pressure, even an inexperienced player stops pondering.
  const remainingRatio = initialMs > 0 ? safeRemaining / initialMs : 0;
  if (safeRemaining <= 10_000 || remainingRatio <= 0.05) {
    return cappedBaseDelay;
  }

  let hesitationChance = getHesitationChance(bot.elo);
  // Familiar opening moves are usually played faster than middlegame moves.
  if (halfMoves < 4) hesitationChance *= 0.55;
  // Below 30 seconds a pause remains possible, but should be uncommon.
  if (safeRemaining <= 30_000) hesitationChance *= 0.3;

  if (random() >= hesitationChance) return cappedBaseDelay;

  const inexperience = clamp((1400 - bot.elo) / 1100, 0, 1);
  const minimumPause = 650 + inexperience * 700;
  const variablePause = 950 + inexperience * 1900;
  let hesitation = minimumPause + random() * variablePause;
  hesitation *= getTimeControlFactor(timeControl.initial);
  if (safeRemaining <= 30_000) hesitation *= 0.4;

  return Math.min(Math.round(baseDelay + hesitation), maximumDelay);
}
