/**
 * Starting, restarting and ending games against the fly.
 */

import { useGameStore } from "@/state/game";
import { useFlyStore } from "@/state/fly";
import { timeOption, useUiStore } from "@/state/ui";
import { getFlyLevel } from "@/ai/bots/levels";
import { flyAvatarUrl } from "@/ai/bots/avatars";
import { getFlyEngine } from "@/ai/fly/engine";
import { triggerChat } from "@/ai/bot-chat";
import { getBot } from "@/ai/bots";
import { resumeAudio } from "@/sounds";
import type { GameResult, PieceColor } from "@/engine/types";
import { t } from "@/i18n";

export function startGame(sideOverride?: PieceColor): void {
  resumeAudio();
  const ui = useUiStore.getState();
  const side: PieceColor = sideOverride ?? (ui.side === "random" ? (Math.random() < 0.5 ? "w" : "b") : ui.side);
  const level = getFlyLevel(ui.level);
  // The fly's first thought waits for this brain to be in place.
  void getFlyEngine().useModel(level.model);
  const player = { userId: "player", username: t("player.you"), avatarUrl: "avatars/player.svg" };
  const fly = { userId: "fly", username: level.name, avatarUrl: flyAvatarUrl(level.id) };
  useFlyStore.getState().clearThought();
  ui.setHint(null);
  ui.setPanelTab("game");
  useGameStore.getState().newGame({
    timeControl: timeOption(ui.timeId).tc,
    myColor: side,
    players: side === "w" ? { w: player, b: fly } : { w: fly, b: player },
    botId: "fly",
  });
}

export function rematch(): void {
  const { myColor } = useGameStore.getState();
  // Like a rematch on a chess site: colours swap.
  startGame(myColor === "w" ? "b" : "w");
}

export function backToLobby(): void {
  useUiStore.getState().setHint(null);
  useGameStore.getState().reset();
}

export function finishGame(result: GameResult): void {
  const state = useGameStore.getState();
  if (state.phase !== "playing") return;
  state.setResult(result);
  const bot = getBot("fly");
  if (bot && result.winner) triggerChat(result.winner === state.myColor ? "loss" : "win", bot);
}

export function resign(): void {
  const { myColor, phase } = useGameStore.getState();
  if (phase !== "playing" || !myColor) return;
  finishGame({ winner: myColor === "w" ? "b" : "w", reason: "resignation" });
}

/** "by checkmate", "on time", … in the current language. */
export function reasonText(reason: GameResult["reason"]): string {
  return t(`reason.${reason}`);
}

export function downloadPgn(): void {
  const { chess, players, result, myColor } = useGameStore.getState();
  const level = getFlyLevel(useUiStore.getState().level);
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  chess.setHeader("Event", t("pgn.event"));
  chess.setHeader("Site", "FlyChess.bzz");
  chess.setHeader("Date", `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`);
  chess.setHeader("White", players.w?.username ?? (myColor === "w" ? t("player.you") : level.name));
  chess.setHeader("Black", players.b?.username ?? (myColor === "b" ? t("player.you") : level.name));
  chess.setHeader("Result", result ? (result.winner === "w" ? "1-0" : result.winner === "b" ? "0-1" : "1/2-1/2") : "*");
  const blob = new Blob([chess.pgn() + "\n"], { type: "application/x-chess-pgn" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `flychess-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.pgn`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
