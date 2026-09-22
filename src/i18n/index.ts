/**
 * Lightweight i18n module: English by default, Polish on request. The choice
 * is remembered in localStorage (best effort).
 */

import { useSyncExternalStore } from "react";
import en from "./en.json";
import pl from "./pl.json";

type Translations = Record<string, string>;
export type Locale = "en" | "pl";

const locales: Record<Locale, Translations> = { en, pl };
const listeners = new Set<() => void>();

const STORAGE_KEY = "fly-chess-thinker:locale";

function savedLocale(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === "pl" ? "pl" : "en";
  } catch {
    return "en";
  }
}

let currentLocale: Locale = typeof localStorage === "undefined" ? "en" : savedLocale();
if (typeof document !== "undefined") document.documentElement.lang = currentLocale;

export function setLocale(locale: string): void {
  const nextLocale: Locale = locale === "pl" ? "pl" : "en";
  if (currentLocale === nextLocale) return;

  currentLocale = nextLocale;
  if (typeof document !== "undefined") document.documentElement.lang = nextLocale;
  try {
    localStorage.setItem(STORAGE_KEY, nextLocale);
  } catch {
    // Storage is optional.
  }
  listeners.forEach((listener) => listener());
}

export function getLocale(): Locale {
  return currentLocale;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe a component to live locale changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/** Translation helper that also makes the calling component reactive. */
export function useTranslation() {
  const locale = useLocale();
  return { locale, t, setLocale } as const;
}

/**
 * Translate a key with optional interpolation.
 * Usage: t("result.wins", { name: "Geralt" }) → "Geralt wins!"
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const translations = locales[currentLocale] || en;
  let text = translations[key] ?? en[key as keyof typeof en] ?? key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }

  return text;
}

/** BCP 47 tag for number formatting in the current language. */
export function formatLocale(): string {
  return currentLocale === "pl" ? "pl-PL" : "en-US";
}
