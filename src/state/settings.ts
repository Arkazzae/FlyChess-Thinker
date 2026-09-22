/**
 * User settings store (Zustand).
 * Persisted to SDK SharedStorage.
 */

import { create } from "zustand";
import { setLocale, type Locale } from "@/i18n";

export interface SettingsState {
  sound: boolean;
  volume: number; // 0-100
  showCoords: boolean;
  showLegalMoves: boolean;
  autoQueen: boolean;
  premoveEnabled: boolean;
  moveAnimation: boolean;
  /** Show the fly's own evaluation beside the board while playing. */
  showEval: boolean;
  language: Locale;

  setSound: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setShowCoords: (show: boolean) => void;
  setShowLegalMoves: (show: boolean) => void;
  setAutoQueen: (auto: boolean) => void;
  setPremoveEnabled: (enabled: boolean) => void;
  setMoveAnimation: (enabled: boolean) => void;
  setShowEval: (show: boolean) => void;
  setLanguage: (language: Locale) => void;
  loadSettings: (settings: Partial<SettingsState>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  sound: true,
  volume: 80,
  showCoords: true,
  showLegalMoves: true,
  autoQueen: false,
  premoveEnabled: true,
  moveAnimation: true,
  showEval: true,
  language: "en",

  setSound: (sound) => set({ sound }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(100, volume)) }),
  setShowCoords: (showCoords) => set({ showCoords }),
  setShowLegalMoves: (showLegalMoves) => set({ showLegalMoves }),
  setAutoQueen: (autoQueen) => set({ autoQueen }),
  setPremoveEnabled: (premoveEnabled) => set({ premoveEnabled }),
  setMoveAnimation: (moveAnimation) => set({ moveAnimation }),
  setShowEval: (showEval) => set({ showEval }),
  setLanguage: (language) => {
    setLocale(language);
    set({ language });
  },
  loadSettings: (settings) => {
    if (settings.language) setLocale(settings.language);
    set(settings);
  },
}));
