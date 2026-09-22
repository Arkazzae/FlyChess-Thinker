/**
 * Interface state that is not part of the chess game: which page is open, the
 * choices on the bot screen, the hint arrow and toasts. Persisted choices live
 * in localStorage (best effort; private windows simply start fresh).
 */

import { create } from "zustand";
import type { FlyLevelId } from "@/ai/bots/levels";
import type { Square, TimeControl } from "@/engine/types";

export type View = "play" | "brain";
export type PanelTab = "game" | "brain" | "review";
export type SideChoice = "w" | "random" | "b";

export interface TimeOption {
  id: string;
  label: string;
  tc: TimeControl;
}

export const TIME_OPTIONS: TimeOption[] = [
  { id: "none", label: "Bez limitu", tc: { initial: 0, increment: 0 } },
  { id: "1+0", label: "1 min", tc: { initial: 60_000, increment: 0 } },
  { id: "3+2", label: "3 | 2", tc: { initial: 180_000, increment: 2000 } },
  { id: "5+0", label: "5 min", tc: { initial: 300_000, increment: 0 } },
  { id: "10+0", label: "10 min", tc: { initial: 600_000, increment: 0 } },
  { id: "15+10", label: "15 | 10", tc: { initial: 900_000, increment: 10_000 } },
];

interface Saved {
  level: FlyLevelId;
  side: SideChoice;
  timeId: string;
  showThoughts: boolean;
  showEval: boolean;
}

const KEY = "fly-chess-thinker:ui:v2";
function load(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Saved>;
  } catch {
    return {};
  }
}
function save(state: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage is optional.
  }
}

interface UiState extends Saved {
  view: View;
  panelTab: PanelTab;
  hint: { from: Square; to: Square } | null;
  hintLoading: boolean;
  toast: { id: number; text: string } | null;
  settingsOpen: boolean;
  setView: (view: View) => void;
  setPanelTab: (tab: PanelTab) => void;
  setLevel: (level: FlyLevelId) => void;
  setSide: (side: SideChoice) => void;
  setTimeId: (id: string) => void;
  setShowThoughts: (show: boolean) => void;
  setShowEval: (show: boolean) => void;
  setHint: (hint: { from: Square; to: Square } | null) => void;
  setHintLoading: (loading: boolean) => void;
  showToast: (text: string) => void;
  setSettingsOpen: (open: boolean) => void;
}

const initial = load();

export const useUiStore = create<UiState>((set, get) => {
  const persist = () => {
    const { level, side, timeId, showThoughts, showEval } = get();
    save({ level, side, timeId, showThoughts, showEval });
  };
  return {
    view: "play",
    panelTab: "game",
    level: initial.level ?? "mysl",
    side: initial.side ?? "w",
    timeId: initial.timeId ?? "none",
    showThoughts: initial.showThoughts ?? false,
    showEval: initial.showEval ?? true,
    hint: null,
    hintLoading: false,
    toast: null,
    settingsOpen: false,
    setView: (view) => set({ view }),
    setPanelTab: (panelTab) => set({ panelTab }),
    setLevel: (level) => { set({ level }); persist(); },
    setSide: (side) => { set({ side }); persist(); },
    setTimeId: (timeId) => { set({ timeId }); persist(); },
    setShowThoughts: (showThoughts) => { set({ showThoughts }); persist(); },
    setShowEval: (showEval) => { set({ showEval }); persist(); },
    setHint: (hint) => set({ hint }),
    setHintLoading: (hintLoading) => set({ hintLoading }),
    showToast: (text) => set({ toast: { id: Date.now(), text } }),
    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  };
});

export function timeOption(id: string): TimeOption {
  return TIME_OPTIONS.find((option) => option.id === id) ?? TIME_OPTIONS[0];
}
