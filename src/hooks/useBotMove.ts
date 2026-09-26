/**
 * Bot move scheduling, initialization and contextual reactions.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "@/state/game";
import { BotController } from "@/ai/bot-controller";
import { triggerChat, clearChatLog, getChatEventForMove } from "@/ai/bot-chat";
import { getBot } from "@/ai/bots";
import { getBotMoveDelay } from "@/ai/bot-timing";
import { seenPositions } from "@/ai/fly/planner";
import { evaluateMaterial } from "@/engine/chess";
import { getTimeRemaining, isFlagged, isUnlimited, startClock } from "@/engine/clock";
import { playMoveSound } from "@/sounds";
import { useUiStore } from "@/state/ui";
import type { Move, PieceColor, Square } from "@/engine/types";

interface ParsedUCIMove {
  from: Square;
  to: Square;
  promotion?: string;
}

export function parseUCIMove(uci: string): ParsedUCIMove | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length === 5 ? uci[4] : undefined,
  };
}

export function useBotMove() {
  const controllerRef = useRef<BotController | null>(null);
  const thinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEvalRef = useRef<number | null>(null);
  const [controllerReady, setControllerReady] = useState(false);

  const phase = useGameStore((state) => state.phase);
  const botId = useGameStore((state) => state.botId);
  const myColor = useGameStore((state) => state.myColor);
  const fen = useGameStore((state) => state.fen);
  const moves = useGameStore((state) => state.moves);
  const chess = useGameStore((state) => state.chess);

  const botColor: PieceColor | null =
    myColor && botId ? (myColor === "w" ? "b" : "w") : null;

  useEffect(() => {
    if (phase !== "playing" || !botId || !botColor) return;

    const controller = new BotController();
    controllerRef.current = controller;
    setControllerReady(false);
    lastEvalRef.current = null;
    clearChatLog();

    let cancelled = false;
    controller
      .init(botId)
      .then(() => {
        if (cancelled) return;
        controller.startGame(botId, botColor);
        controller.setLevel(useUiStore.getState().level);
        setControllerReady(true);

        const bot = getBot(botId);
        if (bot) {
          triggerChat("start", bot);
        }
      })
      .catch((error) => {
        if (!cancelled) console.error("Bot engine initialization failed:", error);
      });

    chatTimerRef.current = setInterval(() => {
      const bot = getBot(botId);
      if (bot && useGameStore.getState().phase === "playing") {
        triggerChat("idle", bot);
      }
    }, 20000);

    return () => {
      cancelled = true;
      setControllerReady(false);
      controller.destroy();
      controllerRef.current = null;
      if (thinkTimerRef.current) clearTimeout(thinkTimerRef.current);
      if (chatTimerRef.current) clearInterval(chatTimerRef.current);
    };
  }, [phase, botId, botColor]);

  const makeBotMove = useCallback(async () => {
    const controller = controllerRef.current;
    const state = useGameStore.getState();
    if (
      !controllerReady ||
      !controller ||
      !botColor ||
      !botId ||
      state.phase !== "playing" ||
      state.result ||
      state.chess.turn() !== botColor
    ) {
      return;
    }

    // On every later move the previous player starts the bot's clock. When the
    // bot has White, however, there is no previous move, so start its clock as
    // soon as it is ready to think.
    if (!isUnlimited(state.timeControl) && !state.clock.running) {
      useGameStore.setState({ clock: startClock(state.clock, botColor) });
    }

    const requestedFen = state.chess.fen();

    try {
      const decision = await controller.getMove(
        requestedFen,
        state.moves.length,
        evaluateMaterial(state.chess),
        isUnlimited(state.timeControl) ? null : getTimeRemaining(state.clock, botColor),
        seenPositions(state.chess.history({ verbose: true }), requestedFen)
      );
      const parsed = parseUCIMove(decision.move);
      if (!parsed) throw new Error(`Engine returned invalid UCI move: ${decision.move}`);

      const playerPerspective = myColor === "w" ? 1 : -1;
      const botPerspective = botColor === "w" ? 1 : -1;
      const evalDrop =
        lastEvalRef.current !== null && decision.positionEvaluation !== null
          ? (lastEvalRef.current - decision.positionEvaluation) * playerPerspective
          : 0;
      const botEvalBefore =
        (decision.positionEvaluation ?? 0) * botPerspective;

      const latestState = useGameStore.getState();
      const bot = getBot(botId);
      const moveDelay = bot
        ? getBotMoveDelay({
            bot,
            baseDelayMs: decision.thinkTime,
            remainingMs: getTimeRemaining(latestState.clock, botColor),
            timeControl: latestState.timeControl,
            halfMoves: latestState.moves.length,
          })
        : decision.thinkTime;

      thinkTimerRef.current = setTimeout(() => {
        thinkTimerRef.current = null;
        const currentState = useGameStore.getState();
        if (
          currentState.phase !== "playing" ||
          currentState.result ||
          currentState.chess.fen() !== requestedFen ||
          currentState.chess.turn() !== botColor
        ) {
          return;
        }

        // setTimeout and the display interval can be throttled independently in
        // a background tab. Check the live timestamp here so a late bot move
        // cannot revive an expired clock with the increment.
        if (!isUnlimited(currentState.timeControl) && isFlagged(currentState.clock, botColor)) {
          return;
        }

        let result;
        try {
          result = currentState.chess.move({
            from: parsed.from,
            to: parsed.to,
            promotion: parsed.promotion,
          });
        } catch {
          console.error("Bot produced an illegal move:", decision.move);
          return;
        }
        if (!result) return;

        useGameStore.getState().applyMove(result as unknown as Move);

        lastEvalRef.current =
          decision.selectedEvaluation ??
          decision.positionEvaluation ??
          lastEvalRef.current;
        // Keep the fly's own judgement of the position; the eval bar shows Stockfish.
        useGameStore.getState().setEvaluation(lastEvalRef.current);

        playMoveSound(result);

        const currentBot = getBot(botId);
        if (currentBot) {
          const chatEvent = getChatEventForMove({
            isCapture: !!result.captured,
            evalDrop,
            botEvalBefore,
            botColor,
          });
          if (chatEvent) triggerChat(chatEvent, currentBot);
        }
      }, moveDelay);
    } catch (error) {
      console.error("Bot move error:", error);
    }
  }, [botColor, botId, controllerReady, myColor]);

  useEffect(() => {
    if (
      !controllerReady ||
      phase !== "playing" ||
      !botColor ||
      !botId
    ) {
      return;
    }

    if (chess.turn() === botColor && !useGameStore.getState().result) {
      const timer = setTimeout(makeBotMove, moves.length === 0 ? 300 : 80);
      return () => clearTimeout(timer);
    }
  }, [
    fen,
    phase,
    botColor,
    botId,
    makeBotMove,
    chess,
    moves.length,
    controllerReady,
  ]);
}
