import { useSettingsStore } from "@/state/settings";
import { useUiStore } from "@/state/ui";
import { soundMove } from "@/sounds";
import { useTranslation } from "@/i18n";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" />
      <span>{label}</span>
    </label>
  );
}

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const ui = useUiStore();
  const settings = useSettingsStore();
  const { t, locale, setLocale } = useTranslation();
  if (!open) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={() => setOpen(false)}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 id="settings-title">{t("settings.title")}</h2>
          <button type="button" className="modal__close" onClick={() => setOpen(false)} aria-label={t("over.close")}>×</button>
        </header>
        <section>
          <h3>{t("settings.language")}</h3>
          <div className="lang-pick" role="radiogroup" aria-label={t("settings.language")}>
            {(["en", "pl"] as const).map((code) => (
              <button key={code} type="button" role="radio" aria-checked={locale === code} className={locale === code ? "is-selected" : ""} onClick={() => setLocale(code)}>
                {code === "en" ? "English" : "Polski"}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>{t("settings.fly")}</h3>
          <Toggle label={t("settings.flyChat")} checked={settings.flyChat} onChange={settings.setFlyChat} />
          <Toggle label={t("select.thoughts")} checked={ui.showThoughts} onChange={ui.setShowThoughts} />
        </section>
        <section>
          <h3>{t("settings.sound")}</h3>
          <Toggle label={t("settings.sounds")} checked={settings.sound} onChange={settings.setSound} />
          <label className="range">
            <span>{t("settings.volume")}</span>
            <input type="range" min={0} max={100} value={settings.volume} onChange={(e) => settings.setVolume(Number(e.target.value))} onPointerUp={soundMove} />
            <output>{settings.volume}%</output>
          </label>
        </section>
        <section>
          <h3>{t("settings.board")}</h3>
          <Toggle label={t("settings.coords")} checked={settings.showCoords} onChange={settings.setShowCoords} />
          <Toggle label={t("settings.legal")} checked={settings.showLegalMoves} onChange={settings.setShowLegalMoves} />
          <Toggle label={t("settings.animation")} checked={settings.moveAnimation} onChange={settings.setMoveAnimation} />
          <Toggle label={t("settings.premove")} checked={settings.premoveEnabled} onChange={settings.setPremoveEnabled} />
          <Toggle label={t("settings.autoQueen")} checked={settings.autoQueen} onChange={settings.setAutoQueen} />
          <Toggle label={t("settings.evalBar")} checked={ui.showEval} onChange={ui.setShowEval} />
        </section>
        <p className="modal__note">{t("settings.shortcuts")}</p>
      </div>
    </div>
  );
}
