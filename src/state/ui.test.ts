import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "fly-chess-thinker:ui:v2";

function mockStorage(settings: string) {
  const entries = new Map([[STORAGE_KEY, settings]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  });
  return entries;
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("saved fly selection", () => {
  it.each([
    ["odruch", "reflex"],
    ["plan", "planner"],
    ["mysl", "thinker"],
    ["odruch4", "rookie"],
    ["plan4", "scribe"],
    ["mysl4", "elder"],
  ])("restores %s as %s and persists the English identifier", async (previous, current) => {
    const settings = { level: previous, side: "b", timeId: "3+2", showThoughts: true, showEval: true };
    const storage = mockStorage(JSON.stringify(settings));
    const { useUiStore } = await import("./ui");

    expect(useUiStore.getState()).toMatchObject({ ...settings, level: current });
    useUiStore.getState().setShowEval(false);
    expect(JSON.parse(storage.get(STORAGE_KEY)!)).toEqual({ ...settings, level: current, showEval: false });
  });

  it.each(["{broken", "null", "{}", '{"level":"unknown"}'])
    ("uses Thinker when saved settings have no valid selection: %s", async (settings) => {
      mockStorage(settings);
      const { useUiStore } = await import("./ui");

      expect(useUiStore.getState().level).toBe("thinker");
    });
});
