import type { PlanOptions } from "@/ai/fly/planner";
import type { FlyModelId } from "@/ai/fly/engine";
import { t } from "@/i18n";

export type FlyLevelId = "reflex" | "planner" | "thinker" | "rookie" | "scribe" | "elder";

/**
 * Three ways each brain can play: instinct, plan (3, 2) and think (6, 4); the browser's thinking
 * level searches at least as wide as (6, 4) when time allows.
 *
 * Ratings come from flybrain/elo_probe.py, 96 games per mode against Stockfish limited to 1320
 * (a 32-game probe after training plus a 64-game re-run on 23 Sep 2026, pooled), about ±65:
 *   fly-v6: instinct 1114, plan 1273, think 1309
 *   fly-v4: instinct 1027, plan 1334, think 1342
 * The flies show these rounded to tens.
 */
export interface FlyLevel {
  id: FlyLevelId;
  /** Which trained brain plays. */
  model: FlyModelId;
  /** Shared play style for matching characters across brain generations. */
  mode: "instinct" | "planning" | "thinking";
  /** Texts are translated on read, so the current language is always used. */
  readonly name: string;
  /** Name on the small bot card. */
  readonly card: string;
  rating: number;
  readonly short: string;
  readonly description: string;
  /** Background of the portrait, like the colour-coded bot cards. */
  tint: string;
  /** Planner settings; `budget` means iterative thinking on the clock. */
  plan: Partial<PlanOptions>;
  budget: boolean;
}

export const FLY_LEVELS: FlyLevel[] = [
  {
    id: "reflex",
    model: "fly-v6",
    mode: "instinct",
    get name() { return t("level.reflex.name"); },
    get card() { return t("level.reflex.card"); },
    rating: 1110,
    get short() { return t("level.reflex.short"); },
    get description() { return t("level.reflex.description"); },
    tint: "#5d9948",
    plan: { candidates: 1, replies: 0 },
    budget: false,
  },
  {
    id: "planner",
    model: "fly-v6",
    mode: "planning",
    get name() { return t("level.planner.name"); },
    get card() { return t("level.planner.card"); },
    rating: 1270,
    get short() { return t("level.planner.short"); },
    get description() { return t("level.planner.description"); },
    tint: "#c98a2e",
    plan: { candidates: 3, replies: 2 },
    budget: false,
  },
  {
    id: "thinker",
    model: "fly-v6",
    mode: "thinking",
    get name() { return t("level.thinker.name"); },
    get card() { return t("level.thinker.card"); },
    rating: 1310,
    get short() { return t("level.thinker.short"); },
    get description() { return t("level.thinker.description"); },
    tint: "#b8573a",
    plan: {},
    budget: true,
  },
  {
    id: "rookie",
    model: "fly-v4",
    mode: "instinct",
    get name() { return t("level.rookie.name"); },
    get card() { return t("level.rookie.card"); },
    rating: 1030,
    get short() { return t("level.rookie.short"); },
    get description() { return t("level.rookie.description"); },
    tint: "#6f7d44",
    plan: { candidates: 1, replies: 0 },
    budget: false,
  },
  {
    id: "scribe",
    model: "fly-v4",
    mode: "planning",
    get name() { return t("level.scribe.name"); },
    get card() { return t("level.scribe.card"); },
    rating: 1330,
    get short() { return t("level.scribe.short"); },
    get description() { return t("level.scribe.description"); },
    tint: "#9a7433",
    plan: { candidates: 3, replies: 2 },
    budget: false,
  },
  {
    id: "elder",
    model: "fly-v4",
    mode: "thinking",
    get name() { return t("level.elder.name"); },
    get card() { return t("level.elder.card"); },
    rating: 1340,
    get short() { return t("level.elder.short"); },
    get description() { return t("level.elder.description"); },
    tint: "#8f4a35",
    plan: {},
    budget: true,
  },
];

/** Previous releases stored Polish identifiers in browser settings. */
const LEGACY_LEVEL_IDS = new Map<string, FlyLevelId>([
  ["odruch", "reflex"],
  ["plan", "planner"],
  ["mysl", "thinker"],
  ["odruch4", "rookie"],
  ["plan4", "scribe"],
  ["mysl4", "elder"],
]);

export function getFlyLevel(id: string | null | undefined): FlyLevel {
  const currentId = id ? LEGACY_LEVEL_IDS.get(id) ?? id : id;
  return FLY_LEVELS.find((level) => level.id === currentId) ?? FLY_LEVELS[2];
}
