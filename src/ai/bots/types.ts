/**
 * Bot type definitions.
 */

export type PersonalityType =
  | "active"
  | "positional"
  | "aggressive"
  | "cautious"
  | "adaptive"
  | "endgame";

export interface ChatMessages {
  start: string[];
  capture: string[];
  blunder: string[];
  trouble: string[];
  brilliantMove: string[];
  win: string[];
  loss: string[];
  idle: string[];
}

export interface BotPalette {
  bgPrimary: string;
  boardLight: string;
  boardDark: string;
  accent: string;
}

export interface BotTaglines {
  win: string;   // bot wins (player loses)
  lose: string;  // bot loses (player wins)
  draw: string;
}

export interface BotDefinition {
  id: string;
  name: string;
  /** Short epithet shown under the name on character cards and the dossier. */
  title: string;
  game: string;
  elo: number;
  personality: PersonalityType;
  thinkDelay: number; // base ms
  chat: ChatMessages;
  avatarUrl: string;
  description: string;
  /** 2-3 one-or-two word play-style tags shown on the dossier. */
  traits: string[];
  taglines: BotTaglines;
  palette: BotPalette;
}
