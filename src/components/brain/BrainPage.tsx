import { useMemo } from "react";
import { ROLE_READOUT } from "@/ai/fly/brain";
import { useFlyStore } from "@/state/fly";
import { useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";
import { Board } from "@/components/Board/Board";
import { BoardOverlays } from "@/components/play/BoardOverlays";
import { BrainCloud } from "./BrainCloud";
import { BrainFlow } from "./BrainFlow";
import { BrainTimeline } from "./BrainTimeline";
import { FlyThoughts } from "./FlyThoughts";
import { FlyRetina } from "./FlyRetina";
import { formatLocale, useTranslation } from "@/i18n";

/** Full-screen view of the fly's brain, with a live board so the game can go on. */
export function BrainPage() {
  const anatomy = useFlyStore((s) => s.anatomy);
  const status = useFlyStore((s) => s.status);
  const phase = useGameStore((s) => s.phase);
  const setView = useUiStore((s) => s.setView);
  const roles = useFlyStore((s) => s.roles);
  const { t } = useTranslation();
  const n = (value: number) => value.toLocaleString(formatLocale());
  const badge = status === "thinking" ? "thinking" : status === "loading" ? "loading" : status === "error" ? "error" : "waiting";
  const readoutCount = useMemo(() => {
    if (!roles) return null;
    let count = 0;
    for (const role of roles) if (role === ROLE_READOUT) count++;
    return count;
  }, [roles]);

  return (
    <div className="brain-page">
      <header className="brain-page__header">
        <div>
          <h1>{t("brain.title")} <span className={`live-badge live-badge--${status}`}>{t(`brain.badge.${badge}`)}</span></h1>
          <p>
            {t("brain.description", { neurons: n(anatomy?.neurons ?? 163903), connections: n(anatomy?.connections ?? 6235682), readout: n(readoutCount ?? 8266) })}
          </p>
        </div>
        <button type="button" className="btn" onClick={() => setView("play")}>{t("brain.back")}</button>
      </header>
      <div className="brain-page__grid">
        <section className="brain-page__cloud">
          <BrainCloud large />
          <BrainTimeline />
        </section>
        <section className="brain-page__side">
          <div className="panel-card">
            <h3>{t("brain.flowTitle")}</h3>
            <BrainFlow />
          </div>
          <div className="panel-card">
            <h3>{t("brain.thoughtsTitle")}</h3>
            <FlyThoughts />
          </div>
        </section>
        <section className="brain-page__board">
          <div className="panel-card">
            <h3>{phase === "lobby" ? t("brain.board") : t("brain.liveGame")}</h3>
            <div className="mini-board"><Board interactive={phase !== "lobby"}><BoardOverlays /></Board></div>
          </div>
          <div className="panel-card">
            <h3>{t("brain.sees")}</h3>
            <FlyRetina />
          </div>
        </section>
      </div>
      <footer className="brain-page__footer">
        {t("brain.footer")}
      </footer>
    </div>
  );
}
