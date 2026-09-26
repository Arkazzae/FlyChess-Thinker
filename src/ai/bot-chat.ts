/**
 * Contextual bot chat system.
 * Triggers messages based on game events and position state.
 * Chat log lives in a Zustand store (state/chat.ts) for React reactivity.
 */

import type { BotDefinition, ChatMessages } from "./bots/types";
import { useChatStore } from "@/state/chat";
import { useSettingsStore } from "@/state/settings";

export type ChatEvent =
  | "start"
  | "capture"
  | "blunder"
  | "trouble"
  | "brilliantMove"
  | "win"
  | "loss"
  | "idle";

export interface ChatMessage {
  text: string;
  botName: string;
  avatarUrl: string;
  timestamp: number;
}

const IDLE_COOLDOWN = 15000; // 15s between idle messages

let lastIdleTime = 0;

export function clearChatLog(): void {
  useChatStore.getState().clear();
  lastIdleTime = 0;
}

export function getChatLog(): ChatMessage[] {
  return useChatStore.getState().log;
}

function pickRandom(pool: string[]): string | null {
  if (!pool || pool.length === 0) return null;
  const msg = pool[Math.floor(Math.random() * pool.length)];
  // Empty strings = silence (intentional)
  return msg || null;
}

function addMessage(text: string, bot: BotDefinition): ChatMessage {
  const msg: ChatMessage = {
    text,
    botName: bot.name,
    avatarUrl: bot.avatarUrl,
    timestamp: Date.now(),
  };
  useChatStore.getState().add(msg);
  return msg;
}

/**
 * Trigger a chat event and get a message (or null for silence).
 */
export function triggerChat(
  event: ChatEvent,
  bot: BotDefinition
): ChatMessage | null {
  // The player can silence the fly in the settings.
  if (!useSettingsStore.getState().flyChat) return null;

  // Rate-limit idle messages
  if (event === "idle") {
    if (Date.now() - lastIdleTime < IDLE_COOLDOWN) return null;
    lastIdleTime = Date.now();
  }

  const pool = bot.chat[event as keyof ChatMessages];
  const text = pickRandom(pool as string[]);
  if (!text) return null;

  return addMessage(text, bot);
}

/**
 * Determine chat event from move context.
 */
export function getChatEventForMove(context: {
  isCapture: boolean;
  evalDrop: number; // positive = player blundered
  botEvalBefore: number; // from bot's POV, centipawns
  botColor: "w" | "b";
}): ChatEvent | null {
  const { isCapture, evalDrop, botEvalBefore } = context;

  // Player blundered (bot gets advantage)
  if (evalDrop > 150) return "blunder";

  // Player made a brilliant move (bot loses advantage)
  if (evalDrop < -200) return "brilliantMove";

  // Bot is in trouble (player has big advantage)
  if (botEvalBefore < -300) return "trouble";

  // Regular capture
  if (isCapture) return "capture";

  return null;
}
