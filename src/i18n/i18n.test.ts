import { afterEach, describe, expect, it } from "vitest";
import en from "./en.json";
import pl from "./pl.json";
import { getLocale, setLocale, t } from "./index";

afterEach(() => setLocale("en"));

describe("translations", () => {
  it("keeps the English and Polish dictionaries in sync", () => {
    expect(Object.keys(pl).sort()).toEqual(Object.keys(en).sort());
    expect(Object.values(pl).every((value) => value.trim().length > 0)).toBe(true);
  });

  it("switches locale and interpolates values", () => {
    setLocale("pl");

    expect(getLocale()).toBe("pl");
    expect(t("timeline.step", { step: 2, steps: 10 })).toBe("Krok 2/10");
  });

  it("falls back to English for unsupported locales", () => {
    setLocale("de");

    expect(getLocale()).toBe("en");
    expect(t("settings.title")).toBe("Settings");
  });
});
