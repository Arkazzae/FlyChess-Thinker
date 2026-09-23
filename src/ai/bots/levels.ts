import type { PlanOptions } from "@/ai/fly/planner";
import type { FlyModelId } from "@/ai/fly/engine";
import { t } from "@/i18n";

export type FlyLevelId = "scout" | "tactician" | "thinker";
export interface FlyLevel {
  id: FlyLevelId;
  model: FlyModelId;
  readonly name: string;
  readonly card: string;
  readonly short: string;
  readonly description: string;
  tint: string;
  plan: Partial<PlanOptions>;
}
/** One checkpoint, three search budgets. Only the 64-visit setting has a rating probe. */
export const FLY_LEVELS: FlyLevel[] = ([
  ["scout", 8, "#5d9948"], ["tactician", 32, "#c98a2e"], ["thinker", 64, "#b8573a"],
] as const).map(([id, simulations, tint]) => ({
  id, model: "droso-1", tint, plan: { simulations },
  get name() { return t(`level.${id}.name`); },
  get card() { return t(`level.${id}.card`); },
  get short() { return t(`level.${id}.short`); },
  get description() { return t(`level.${id}.description`); },
}));
const LEGACY_LEVEL_IDS: Record<string, FlyLevelId> = {
  reflex: "scout", rookie: "scout", odruch: "scout", odruch4: "scout",
  planner: "tactician", scribe: "tactician", plan: "tactician", plan4: "tactician",
  elder: "thinker", mysl: "thinker", mysl4: "thinker",
};
export function getFlyLevel(id: string | null | undefined): FlyLevel {
  const current = id ? LEGACY_LEVEL_IDS[id] ?? id : "thinker";
  return FLY_LEVELS.find(level => level.id === current) ?? FLY_LEVELS[2];
}
