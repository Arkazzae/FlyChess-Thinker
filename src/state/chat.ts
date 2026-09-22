/**
 * Reactive chat log store.
 * Mirrors the module-level array previously in bot-chat.ts so React can
 * subscribe via useChatStore() instead of polling.
 */

import { create } from "zustand";
import type { ChatMessage } from "@/ai/bot-chat";

const MAX_LOG_SIZE = 6;

interface ChatState {
  log: ChatMessage[];
  add: (msg: ChatMessage) => void;
  clear: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  log: [],
  add: (msg) =>
    set((state) => {
      const next = [...state.log, msg];
      if (next.length > MAX_LOG_SIZE) next.shift();
      return { log: next };
    }),
  clear: () => set({ log: [] }),
}));
