/**
 * Bot registry — Fly Chess has exactly one opponent: the connectome.
 */

import type { BotDefinition, PersonalityType } from "./types";
import { fly } from "./fly";

export const BOTS: Record<string, BotDefinition> = { fly };

/** The only opponent in this build. */
export const DEFAULT_BOT_ID = "fly";

export function getBot(id: string): BotDefinition | undefined {
  return BOTS[id];
}

export type { BotDefinition } from "./types";

/** Difficulty tier label shown on the dossier. */
export function getBotTier(elo: number): string {
  if (elo < 700) return "Rookie";
  if (elo < 1200) return "Challenger";
  if (elo < 1600) return "Veteran";
  if (elo < 1900) return "Expert";
  if (elo < 2150) return "Master";
  return "Legend";
}

const PERSONALITY_LABELS: Record<PersonalityType, string> = {
  active: "Active",
  positional: "Positional",
  aggressive: "Aggressive",
  cautious: "Cautious",
  adaptive: "Adaptive",
  endgame: "Endgame",
};

/** Human-readable play style for the dossier stat row. */
export function getBotStyle(personality: PersonalityType): string {
  return PERSONALITY_LABELS[personality];
}
