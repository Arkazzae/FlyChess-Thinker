import type { PlanOptions } from "@/ai/fly/planner";
import type { FlyModelId } from "@/ai/fly/engine";
import { t } from "@/i18n";

export type FlyLevelId = "odruch" | "plan" | "mysl" | "odruch4" | "plan4" | "mysl4";

/**
 * Three ways the same v6 brain can play. Ratings are the fly-v6 Elo probe
 * (flybrain/elo_probe.py, 32 games per mode against Stockfish limited to 1320):
 * instinct 1099, plan (3, 2) 1309, think (6, 4) 1342. The browser's thinking
 * level searches at least as wide as (6, 4) when time allows.
 *
 * The older fly-v4 is playable too, with its own flies; its probe (same method) measured
 * instinct 982, plan 1397, think 1320.
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
    rating: 1100,
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
    rating: 1310,
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
    rating: 1340,
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
    rating: 982,
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
    rating: 1397,
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
    rating: 1320,
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
