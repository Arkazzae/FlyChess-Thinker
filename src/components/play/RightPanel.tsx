import { useGameStore } from "@/state/game";
import { useFlyStore } from "@/state/fly";
import { useUiStore } from "@/state/ui";
import { BrainTab } from "@/components/brain/BrainTab";
import { IconBrain } from "@/components/shell/Icons";
import { BotSelect } from "./BotSelect";
import { GameTab } from "./GameTab";
import { ReviewTab } from "./ReviewTab";
import { useTranslation } from "@/i18n";

export function RightPanel() {
  const phase = useGameStore((s) => s.phase);
  const tab = useUiStore((s) => s.panelTab);
  const setTab = useUiStore((s) => s.setPanelTab);
  const status = useFlyStore((s) => s.status);
  const { t } = useTranslation();

  return (
    <aside className="right-panel">
      <header className="right-panel__header">
        <h2>{t("panel.title")}</h2>
      </header>
      {phase !== "lobby" && (
        <div className="panel-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "game"} className={tab === "game" ? "is-active" : ""} onClick={() => setTab("game")}>
            {t("panel.game")}
          </button>
          <button type="button" role="tab" aria-selected={tab === "brain"} className={tab === "brain" ? "is-active" : ""} onClick={() => setTab("brain")}>
            <IconBrain size={18} /> {t("panel.brain")} {status === "thinking" && <i className="live-dot" />}
          </button>
          {phase === "ended" && (
            <button type="button" role="tab" aria-selected={tab === "review"} className={tab === "review" ? "is-active" : ""} onClick={() => setTab("review")}>
              {t("panel.review")}
            </button>
          )}
        </div>
      )}
      <div className="right-panel__body">
        {phase === "lobby" ? <BotSelect /> : tab === "brain" ? <BrainTab /> : tab === "review" && phase === "ended" ? <ReviewTab /> : <GameTab />}
      </div>
    </aside>
  );
}
