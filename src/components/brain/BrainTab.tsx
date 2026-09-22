import { useUiStore } from "@/state/ui";
import { BrainCloud } from "./BrainCloud";
import { BrainFlow } from "./BrainFlow";
import { BrainTimeline } from "./BrainTimeline";
import { FlyThoughts } from "./FlyThoughts";
import { FlyRetina } from "./FlyRetina";
import { IconExpand } from "@/components/shell/Icons";
import { useTranslation } from "@/i18n";

/** Compact brain view for the side panel. */
export function BrainTab() {
  const setView = useUiStore((s) => s.setView);
  const { t } = useTranslation();
  return (
    <div className="brain-tab">
      <div className="brain-tab__cloud">
        <BrainCloud />
        <button type="button" className="brain-tab__expand" onClick={() => setView("brain")} title={t("brain.fullscreen")} aria-label={t("brain.fullscreen")}><IconExpand /></button>
      </div>
      <BrainTimeline />
      <section className="panel-section">
        <h3>{t("brain.flowShort")}</h3>
        <BrainFlow compact />
      </section>
      <section className="panel-section">
        <h3>{t("brain.thoughtsTitle")}</h3>
        <FlyThoughts limit={5} />
      </section>
      <details className="panel-section">
        <summary>{t("brain.sees")}</summary>
        <FlyRetina />
      </details>
    </div>
  );
}
