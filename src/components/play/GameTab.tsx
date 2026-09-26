import { FlyMascot } from "@/components/FlyMascot";
import { useGameStore } from "@/state/game";
import { useChatStore } from "@/state/chat";
import { useSettingsStore } from "@/state/settings";
import { useFlyStore } from "@/state/fly";
import { useUiStore } from "@/state/ui";
import { getFlyLevel } from "@/ai/bots/levels";
import { requestHint } from "@/ai/hint";
import { useOpeningName } from "@/hooks/useOpeningName";
import { backToLobby, downloadPgn, reasonText, rematch, resign } from "@/game/session";
import { useTranslation } from "@/i18n";
import { MoveTable } from "./MoveTable";
import { IconBrain, IconBulb, IconChevron, IconDownload, IconFlag, IconFlip, IconGear, IconUndo } from "@/components/shell/Icons";

function BrainStrip() {
  const status = useFlyStore((s) => s.status);
  const thinking = useFlyStore((s) => s.thinking);
  const thought = useFlyStore((s) => s.thought);
  const setPanelTab = useUiStore((s) => s.setPanelTab);
  const { t } = useTranslation();
  const decision = (status === "thinking" ? thinking?.decision : undefined) ?? thought?.decision;
  const best = decision?.candidates.find((c) => c.uci === decision.move);
  return (
    <button type="button" className={`brain-strip${status === "thinking" ? " is-live" : ""}`} onClick={() => setPanelTab("brain")}>
      <IconBrain size={22} />
      <span>
        {status === "thinking"
          ? decision ? <>{t("strip.considering")} <b>{best?.san}</b> {t("strip.positions", { count: decision.simulations })}</> : t("strip.flowing")
          : decision ? <>{t("strip.played")} <b>{best?.san}</b> {t("strip.after", { count: decision.simulations })}</> : t("strip.see")}
      </span>
      <em>{t("strip.brain")}</em>
    </button>
  );
}

export function GameTab() {
  const phase = useGameStore((s) => s.phase);
  const fen = useGameStore((s) => s.fen);
  const moves = useGameStore((s) => s.moves);
  const result = useGameStore((s) => s.result);
  const myColor = useGameStore((s) => s.myColor);
  const viewPly = useGameStore((s) => s.viewPly);
  const setViewPly = useGameStore((s) => s.setViewPly);
  const takeback = useGameStore((s) => s.takeback);
  const flipBoard = useGameStore((s) => s.flipBoard);
  const log = useChatStore((s) => s.log);
  const flyChat = useSettingsStore((s) => s.flyChat);
  const hintLoading = useUiStore((s) => s.hintLoading);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const showToast = useUiStore((s) => s.showToast);
  const level = getFlyLevel(useUiStore((s) => s.level));
  const opening = useOpeningName(fen);
  const flyThinking = useFlyStore((s) => s.status === "thinking") && phase === "playing";
  const { t } = useTranslation();
  const message = log.at(-1)?.text ?? "Bzz.";
  const current = viewPly ?? moves.length;
  const myTurn = phase === "playing" && myColor !== null && useGameStore.getState().chess.turn() === myColor;

  const undo = () => {
    if (!takeback()) {
      showToast(t("toast.undo"));
    }
  };

  return (
    <div className="game-tab">
      <div className="bot-chat">
        <div className="bot-chat__portrait" style={{ background: level.tint }}><FlyMascot thinking={flyThinking} still variant={level.id} /></div>
        {flyChat
          ? <div className="speech" key={log.at(-1)?.timestamp ?? 0}><p>{message}</p></div>
          : <div className="bot-hero__name"><strong>{level.name}</strong> <span>{level.short}</span></div>}
      </div>
      <BrainStrip />
      <div className="opening-row">
        <span>{opening ? <><b>{opening.eco}</b> {opening.name}</> : t("game.startPosition")}</span>
      </div>
      <MoveTable />
      {phase === "ended" && result && (
        <div className="result-row">
          <strong>{result.winner === null ? "½–½" : result.winner === "w" ? "1–0" : "0–1"}</strong>
          <span>{result.winner === null ? t("game.draw") : result.winner === myColor ? t("game.youWon") : t("game.flyWon")} {reasonText(result.reason)}</span>
        </div>
      )}
      <div className="game-tab__controls">
        {phase === "ended" ? (
          <>
            <button type="button" className="btn btn--wide" onClick={backToLobby}>{t("game.newGame")}</button>
            <button type="button" className="btn btn--wide" onClick={() => { useUiStore.getState().setPanelTab("review"); setViewPly(0); }}>{t("panel.review")}</button>
            <button type="button" className="btn btn--green btn--wide" onClick={rematch}>{t("game.rematch")}</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--icon" onClick={resign} title={t("game.resign")} aria-label={t("game.resign")} disabled={phase !== "playing"}><IconFlag /></button>
            <button type="button" className="btn btn--icon" onClick={undo} title={t("game.undo")} aria-label={t("game.undo")} disabled={phase !== "playing" || moves.length === 0}><IconUndo /></button>
            <button type="button" className={`btn btn--icon${hintLoading ? " is-loading" : ""}`} onClick={() => void requestHint()} title={t("game.hint")} aria-label={t("game.hintShort")} disabled={!myTurn || hintLoading}><IconBulb /></button>
          </>
        )}
      </div>
      <div className="game-tab__footer">
        <button type="button" onClick={downloadPgn} title={t("game.pgn")} aria-label={t("game.pgn")}><IconDownload /></button>
        <button type="button" onClick={() => setSettingsOpen(true)} title={t("settings.title")} aria-label={t("settings.title")}><IconGear /></button>
        <button type="button" onClick={flipBoard} title={t("game.flip")} aria-label={t("game.flip")}><IconFlip /></button>
        <span className="game-tab__nav">
          <button type="button" onClick={() => setViewPly(0)} disabled={current === 0} aria-label={t("game.first")}><IconChevron dir="first" /></button>
          <button type="button" onClick={() => setViewPly(current - 1)} disabled={current === 0} aria-label={t("game.prev")}><IconChevron dir="left" /></button>
          <button type="button" onClick={() => setViewPly(current + 1)} disabled={viewPly === null} aria-label={t("game.next")}><IconChevron dir="right" /></button>
          <button type="button" onClick={() => setViewPly(null)} disabled={viewPly === null} aria-label={t("game.last")}><IconChevron dir="last" /></button>
        </span>
      </div>
    </div>
  );
}
