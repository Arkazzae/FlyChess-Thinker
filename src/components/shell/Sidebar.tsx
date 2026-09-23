import { useUiStore } from "@/state/ui";
import { useFlyStore } from "@/state/fly";
import { resumeAudio } from "@/sounds";
import { useTranslation } from "@/i18n";
import { BrainBadge, IconGear, IconGithub, IconPlay, Logo } from "./Icons";

const REPOSITORY = "https://github.com/Arkazzae/FlyChess-Thinker";

export function Sidebar() {
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const status = useFlyStore((s) => s.status);
  const { t, locale, setLocale } = useTranslation();

  return (
    <nav className="sidebar" aria-label={t("nav.menu")}>
      <button type="button" className="sidebar__logo" onClick={() => setView("play")} aria-label={t("nav.home")}><Logo /></button>
      <ul className="sidebar__nav">
        <li>
          <button type="button" className={view === "play" ? "is-active" : ""} onClick={() => { resumeAudio(); setView("play"); }}>
            <IconPlay /><span>{t("nav.play")}</span>
          </button>
        </li>
        <li>
          <button type="button" className={`sidebar__brain${view === "brain" ? " is-active" : ""}`} onClick={() => { resumeAudio(); setView("brain"); }}>
            <BrainBadge size={30} live={status === "thinking"} /><span>{t("nav.brain")}</span>
            {status === "thinking" && <span className="sr-only">{t("nav.thinking")}</span>}
          </button>
        </li>
      </ul>
      <div className="sidebar__bottom">
        <div className="sidebar__tools">
          <button type="button" className="sidebar__lang" aria-label={t("nav.language")} title={t("nav.language")} onClick={() => setLocale(locale === "en" ? "pl" : "en")}>
            {locale === "en" ? "EN" : "PL"}
          </button>
          <button type="button" className="sidebar__tool" aria-label={t("nav.settings")} title={t("nav.settings")} onClick={() => setSettingsOpen(true)}>
            <IconGear size={20} />
          </button>
          <a className="sidebar__tool" href={REPOSITORY} target="_blank" rel="noopener noreferrer" aria-label={t("nav.github")} title={t("nav.github")}>
            <IconGithub />
          </a>
        </div>
      </div>
    </nav>
  );
}
