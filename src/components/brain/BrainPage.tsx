import { useMemo } from "react";
import { ROLE_READOUT } from "@/ai/fly/brain";
import { useFlyStore } from "@/state/fly";
import { useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";
import { formatLocale, useTranslation } from "@/i18n";
import { GROUP_COLORS } from "@/brain/CloudView";
import { Board } from "@/components/Board/Board";
import { BoardOverlays } from "@/components/play/BoardOverlays";
import { BrainCloud } from "./BrainCloud";
import { BrainFlow } from "./BrainFlow";
import { BrainTimeline } from "./BrainTimeline";
import { FlyThoughts } from "./FlyThoughts";
import { FlyRetina } from "./FlyRetina";

const STEPS = ["see", "spread", "read", "choose"] as const;
const FAQ = ["real", "learned", "strength", "learning"] as const;

/**
 * The fly's brain explained: one page read top to bottom, from what you are looking at, to how a
 * move is made, to the details. Every picture comes from the fly's own recorded activity.
 */
export function BrainPage() {
  const { t } = useTranslation();
  const anatomy = useFlyStore((s) => s.anatomy);
  const status = useFlyStore((s) => s.status);
  const roles = useFlyStore((s) => s.roles);
  const phase = useGameStore((s) => s.phase);
  const setView = useUiStore((s) => s.setView);
  const n = (value: number) => value.toLocaleString(formatLocale());
  const readoutCount = useMemo(() => {
    if (!roles) return 8266;
    let count = 0;
    for (const role of roles) if (role === ROLE_READOUT) count++;
    return count;
  }, [roles]);
  const regionCounts = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0];
    if (anatomy) for (const g of anatomy.groups) counts[g]++;
    return counts;
  }, [anatomy]);
  const badge = status === "thinking" ? "thinking" : status === "loading" ? "loading" : status === "error" ? "error" : "waiting";

  return (
    <div className="bp">
      <header className="bp-hero">
        <div className="bp-hero__text">
          <p className="bp-eyebrow">MaleCNS v1.0 · {anatomy?.label ?? "fly-v6"} · {t("model.by")}</p>
          <h1>{t("bp.title")}</h1>
          <p className="bp-lead">{t("bp.lead")}</p>
          <ul className="bp-stats">
            <li><strong>{n(anatomy?.neurons ?? 163903)}</strong><span>{t("bp.stat.neurons")}</span></li>
            <li><strong>{n(anatomy?.connections ?? 6235682)}</strong><span>{t("bp.stat.connections")}</span></li>
            <li><strong>10</strong><span>{t("bp.stat.steps")}</span></li>
            <li><strong>{n(readoutCount)}</strong><span>{t("bp.stat.readout")}</span></li>
          </ul>
        </div>
        <div className="bp-hero__side">
          <span className={`live-badge live-badge--${status}`}>{t(`brain.badge.${badge}`)}</span>
          <button type="button" className="btn" onClick={() => setView("play")}>{t("brain.back")}</button>
        </div>
      </header>

      <section className="bp-stage" aria-labelledby="bp-stage-title">
        <div className="bp-stage__main">
          <div className="bp-cloud"><BrainCloud /></div>
          <BrainTimeline />
        </div>
        <aside className="bp-stage__side">
          <h2 id="bp-stage-title">{t("bp.stage.title")}</h2>
          <p className="bp-text">{t("bp.stage.body")}</p>
          <div className="bp-board"><Board interactive={phase !== "lobby"}><BoardOverlays /></Board></div>
          <ul className="bp-regions">
            {regionCounts.map((count, g) => (
              <li key={g}>
                <i style={{ background: GROUP_COLORS[g] }} />
                <div>
                  <strong>{t(`group.${g}`)}</strong> <span>{n(count)}</span>
                  <p>{t(`bp.region.${g}`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="bp-section" aria-labelledby="bp-how">
        <h2 id="bp-how">{t("bp.how.title")}</h2>
        <ol className="bp-steps">
          {STEPS.map((step, index) => (
            <li key={step}>
              <span className="bp-steps__n">{index + 1}</span>
              <strong>{t(`bp.how.${step}.title`)}</strong>
              <p>{t(`bp.how.${step}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bp-section bp-split">
        <div>
          <h2>{t("brain.flowTitle")}</h2>
          <p className="bp-text">{t("bp.flow.body")}</p>
          <BrainFlow />
        </div>
        <div>
          <h2>{t("brain.thoughtsTitle")}</h2>
          <p className="bp-text">{t("bp.thoughts.body")}</p>
          <div className="bp-card"><FlyThoughts /></div>
        </div>
      </section>

      <section className="bp-section bp-split">
        <div>
          <h2>{t("brain.sees")}</h2>
          <p className="bp-text">{t("bp.sees.body")}</p>
          <FlyRetina />
        </div>
        <div>
          <h2>{t("bp.faq.title")}</h2>
          <dl className="bp-faq">
            {FAQ.map((key) => (
              <div key={key}>
                <dt>{t(`bp.faq.${key}.q`)}</dt>
                <dd>{t(`bp.faq.${key}.a`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="bp-footer">{t("brain.footer")}</footer>
    </div>
  );
}
