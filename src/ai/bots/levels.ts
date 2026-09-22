import type { PlanOptions } from "@/ai/fly/planner";
import { t } from "@/i18n";

export type FlyLevelId = "odruch" | "plan" | "mysl";

/**
 * Three ways the same v6 brain can play. Ratings are the fly-v6 Elo probe
 * (flybrain/elo_probe.py, 32 games per mode against Stockfish limited to 1320):
 * instinct 1099, plan (3, 2) 1309, think (6, 4) 1342. The browser's thinking
 * level searches at least as wide as (6, 4) when time allows.
 */
export interface FlyLevel {
  id: FlyLevelId;
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
    get name() { return t("level.plan.name"); },
    get card() { return t("level.plan.card"); },
    rating: 1310,
    get short() { return t("level.plan.short"); },
    get description() { return t("level.plan.description"); },
    tint: "#3d7fb8",
    plan: { candidates: 3, replies: 2 },
    budget: false,
  },
  {
    id: "mysl",
    get name() { return t("level.mysl.name"); },
    get card() { return t("level.mysl.card"); },
    rating: 1340,
    get short() { return t("level.mysl.short"); },
    get description() { return t("level.mysl.description"); },
    tint: "#9b4fb3",
    plan: {},
    budget: true,
  },
];

export function getFlyLevel(id: string | null | undefined): FlyLevel {
  return FLY_LEVELS.find((level) => level.id === id) ?? FLY_LEVELS[2];
}
