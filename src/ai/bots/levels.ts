import type { PlanOptions } from "@/ai/fly/planner";
import type { FlyModelId } from "@/ai/fly/engine";
import { t } from "@/i18n";

export type FlyLevelId = "odruch" | "plan" | "mysl" | "odruch4" | "plan4" | "mysl4";

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
    id: "odruch",
    model: "fly-v6",
    get name() { return t("level.odruch.name"); },
    get card() { return t("level.odruch.card"); },
    rating: 1110,
    get short() { return t("level.odruch.short"); },
    get description() { return t("level.odruch.description"); },
    tint: "#5d9948",
    plan: { candidates: 1, replies: 0 },
    budget: false,
  },
  {
    id: "plan",
    model: "fly-v6",
    get name() { return t("level.plan.name"); },
    get card() { return t("level.plan.card"); },
    rating: 1270,
    get short() { return t("level.plan.short"); },
    get description() { return t("level.plan.description"); },
    tint: "#c98a2e",
    plan: { candidates: 3, replies: 2 },
    budget: false,
  },
  {
    id: "mysl",
    model: "fly-v6",
    get name() { return t("level.mysl.name"); },
    get card() { return t("level.mysl.card"); },
    rating: 1310,
    get short() { return t("level.mysl.short"); },
    get description() { return t("level.mysl.description"); },
    tint: "#b8573a",
    plan: {},
    budget: true,
  },
  {
    id: "odruch4",
    model: "fly-v4",
    get name() { return t("level.odruch4.name"); },
    get card() { return t("level.odruch4.card"); },
    rating: 1030,
    get short() { return t("level.odruch4.short"); },
    get description() { return t("level.odruch4.description"); },
    tint: "#6f7d44",
    plan: { candidates: 1, replies: 0 },
    budget: false,
  },
  {
    id: "plan4",
    model: "fly-v4",
    get name() { return t("level.plan4.name"); },
    get card() { return t("level.plan4.card"); },
    rating: 1330,
    get short() { return t("level.plan4.short"); },
    get description() { return t("level.plan4.description"); },
    tint: "#9a7433",
    plan: { candidates: 3, replies: 2 },
    budget: false,
  },
  {
    id: "mysl4",
    model: "fly-v4",
    get name() { return t("level.mysl4.name"); },
    get card() { return t("level.mysl4.card"); },
    rating: 1340,
    get short() { return t("level.mysl4.short"); },
    get description() { return t("level.mysl4.description"); },
    tint: "#8f4a35",
    plan: {},
    budget: true,
  },
];

export function getFlyLevel(id: string | null | undefined): FlyLevel {
  return FLY_LEVELS.find((level) => level.id === id) ?? FLY_LEVELS[2];
}
