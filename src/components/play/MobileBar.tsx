import { useGameStore } from "@/state/game";
import { useFlyStore } from "@/state/fly";
import { useUiStore } from "@/state/ui";
import { requestHint } from "@/ai/hint";
import { backToLobby, rematch, resign } from "@/game/session";
import { useReviewStore } from "@/ai/review";
import { useTranslation } from "@/i18n";
import { IconBrain, IconBulb, IconChevron, IconFlag, IconFlip, IconUndo } from "@/components/shell/Icons";

/** Phones only: the game's actions pinned to the bottom of the screen, always under the thumb. */
export function MobileBar() {
  const { t } = useTranslation();
  const phase = useGameStore((s) => s.phase);
  const moves = useGameStore((s) => s.moves);
  const myColor = useGameStore((s) => s.myColor);
  const viewPly = useGameStore((s) => s.viewPly);
  const setViewPly = useGameStore((s) => s.setViewPly);
  const takeback = useGameStore((s) => s.takeback);
  const flipBoard = useGameStore((s) => s.flipBoard);
  useGameStore((s) => s.fen);
  const hintLoading = useUiStore((s) => s.hintLoading);
  const setPanelTab = useUiStore((s) => s.setPanelTab);
  const thinking = useFlyStore((s) => s.status === "thinking");
  const panelTab = useUiStore((s) => s.panelTab);
  const autoplay = useReviewStore((s) => s.autoplay);
  const setAutoplay = useReviewStore((s) => s.setAutoplay);
  if (phase === "lobby") return null;
  const current = viewPly ?? moves.length;
  const myTurn = phase === "playing" && myColor !== null && useGameStore.getState().chess.turn() === myColor;

  /** Open a panel tab and bring the panel into view. */
  const show = (tab: "brain" | "review") => {
    setPanelTab(tab);
    requestAnimationFrame(() => document.querySelector(".right-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  if (phase === "ended" && panelTab === "review") {
    // Reviewing: the bar becomes the replay controls, the board stays in view above it.
    const step = (ply: number | null) => { setAutoplay(false); setViewPly(ply); };
    return (
      <nav className="mobile-bar" aria-label={t("panel.review")}>
        <button type="button" className="mobile-bar__new" onClick={() => { setAutoplay(false); backToLobby(); }} aria-label={t("game.newGame")}>+</button>
        <button type="button" onClick={() => step(0)} disabled={current === 0} aria-label={t("game.first")}><IconChevron dir="first" size={22} /></button>
        <button type="button" onClick={() => step(current - 1)} disabled={current === 0} aria-label={t("game.prev")}><IconChevron dir="left" size={22} /></button>
        <button type="button" className="mobile-bar__play" onClick={() => {
          if (!autoplay && current >= moves.length) setViewPly(0);
          setAutoplay(!autoplay);
        }}>{autoplay ? "❚❚" : "▶"}</button>
        <button type="button" onClick={() => step(current + 1)} disabled={viewPly === null} aria-label={t("game.next")}><IconChevron dir="right" size={22} /></button>
        <button type="button" onClick={() => step(null)} disabled={viewPly === null} aria-label={t("game.last")}><IconChevron dir="last" size={22} /></button>
      </nav>
    );
  }
  if (phase === "ended") {
    return (
      <nav className="mobile-bar mobile-bar--ended" aria-label={t("nav.menu")}>
        <button type="button" onClick={backToLobby}>{t("game.newGame")}</button>
        <button type="button" onClick={() => { setViewPly(0); setPanelTab("review"); }}>{t("panel.review")}</button>
        <button type="button" className="is-primary" onClick={rematch}>{t("game.rematch")}</button>
      </nav>
    );
  }
  return (
    <nav className="mobile-bar" aria-label={t("nav.menu")}>
      <button type="button" onClick={resign} aria-label={t("game.resign")}><IconFlag /></button>
      <button type="button" onClick={() => takeback()} disabled={!moves.length} aria-label={t("game.undo")}><IconUndo /></button>
      <button type="button" onClick={() => void requestHint()} disabled={!myTurn || hintLoading} aria-label={t("game.hintShort")} className={hintLoading ? "is-loading" : ""}><IconBulb /></button>
      <button type="button" onClick={() => show("brain")} aria-label={t("panel.brain")} className={thinking ? "is-live" : ""}><IconBrain size={24} /></button>
      <button type="button" onClick={flipBoard} aria-label={t("game.flip")}><IconFlip /></button>
      <button type="button" onClick={() => setViewPly(current - 1)} disabled={current === 0} aria-label={t("game.prev")}><IconChevron dir="left" size={22} /></button>
      <button type="button" onClick={() => setViewPly(current + 1)} disabled={viewPly === null} aria-label={t("game.next")}><IconChevron dir="right" size={22} /></button>
    </nav>
  );
}
