/**
 * User settings store (Zustand). Saved in localStorage (best effort; private
 * windows simply start with the defaults). The language lives in i18n.
 */

import { create } from "zustand";

interface Settings {
  sound: boolean;
  volume: number; // 0-100
  showCoords: boolean;
  showLegalMoves: boolean;
  /** Promote straight to a queen instead of opening the piece picker. */
  autoQueen: boolean;
  premoveEnabled: boolean;
  moveAnimation: boolean;
  /** Let the fly comment on the game in its speech bubble. */
  flyChat: boolean;
}

export interface SettingsState extends Settings {
  setSound: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setShowCoords: (show: boolean) => void;
  setShowLegalMoves: (show: boolean) => void;
  setAutoQueen: (auto: boolean) => void;
  setPremoveEnabled: (enabled: boolean) => void;
  setMoveAnimation: (enabled: boolean) => void;
  setFlyChat: (enabled: boolean) => void;
}

const DEFAULTS: Settings = {
  sound: true,
  volume: 80,
  showCoords: true,
  showLegalMoves: true,
  autoQueen: false,
  premoveEnabled: true,
  moveAnimation: true,
  flyChat: true,
};

const KEY = "fly-chess-thinker:settings:v1";
const KEYS = Object.keys(DEFAULTS) as (keyof Settings)[];

/** The saved fields of a state, ignoring anything of the wrong type. */
function pick(source: Partial<Record<keyof Settings, unknown>>): Partial<Settings> {
  return Object.fromEntries(KEYS.filter((key) => typeof source[key] === typeof DEFAULTS[key]).map((key) => [key, source[key]]));
}

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings> | null;
    const settings = { ...DEFAULTS, ...pick(saved ?? {}) };
    return { ...settings, volume: clampVolume(settings.volume) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings: Partial<Settings>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage is optional.
  }
}

function clampVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : DEFAULTS.volume;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const update = (patch: Partial<Settings>) => {
    set(patch);
    save(pick(get()));
  };
  return {
    ...load(),
    setSound: (sound) => update({ sound }),
    setVolume: (volume) => update({ volume: clampVolume(volume) }),
    setShowCoords: (showCoords) => update({ showCoords }),
    setShowLegalMoves: (showLegalMoves) => update({ showLegalMoves }),
    setAutoQueen: (autoQueen) => update({ autoQueen }),
    setPremoveEnabled: (premoveEnabled) => update({ premoveEnabled }),
    setMoveAnimation: (moveAnimation) => update({ moveAnimation }),
    setFlyChat: (flyChat) => update({ flyChat }),
  };
});
