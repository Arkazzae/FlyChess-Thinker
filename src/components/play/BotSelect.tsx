import { useMemo } from "react";
import { FlyMascot } from "@/components/FlyMascot";
import { useTranslation } from "@/i18n";
import { FLY_LEVELS, getFlyLevel, type FlyLevelId } from "@/ai/bots/levels";
import { getFlyEngine } from "@/ai/fly/engine";
import { useFlyStore } from "@/state/fly";
import { useSettingsStore } from "@/state/settings";
import { TIME_OPTIONS, useUiStore, type SideChoice } from "@/state/ui";
import { startGame } from "@/game/session";

const SIDES: SideChoice[] = ["w", "random", "b"];

function KingIcon({ side }: { side: SideChoice }) {
  if (side === "random") {
    return (
      <span className="side-king side-king--random">
        <img src="pieces/wk.png" alt="" />
        <img src="pieces/bk.png" alt="" />
      </span>
    );
  }
  return <span className="side-king"><img src={`pieces/${side}k.png`} alt="" /></span>;
}

/** The pre-game screen: pick the fly, colour and time, then play. */
export function BotSelect() {
  const levelId = useUiStore((s) => s.level);
  const setLevel = useUiStore((s) => s.setLevel);
  const side = useUiStore((s) => s.side);
  const setSide = useUiStore((s) => s.setSide);
  const timeId = useUiStore((s) => s.timeId);
  const setTimeId = useUiStore((s) => s.setTimeId);
  const showThoughts = useUiStore((s) => s.showThoughts);
  const setShowThoughts = useUiStore((s) => s.setShowThoughts);
  const showEval = useUiStore((s) => s.showEval);
  const setShowEval = useUiStore((s) => s.setShowEval);
  const flyChat = useSettingsStore((s) => s.flyChat);
  const status = useFlyStore((s) => s.status);
  const level = getFlyLevel(levelId);
  const { t } = useTranslation();
  /** Pick a fly; its brain starts loading straight away so the game can begin without waiting. */
  const choose = (id: FlyLevelId) => {
    setLevel(id);
    void getFlyEngine().useModel(getFlyLevel(id).model);
  };
  // A new line every time a different fly is picked.
  const speech = useMemo(() => Math.floor(Math.random() * 3), [level.id]);

  return (
    <div className="bot-select">
      <div className="bot-hero" title={level.description}>
        <div className="bot-hero__portrait" style={{ background: level.tint }}>
          <FlyMascot still variant={level.id} />
        </div>
        <div className="bot-hero__text">
          <div className="bot-hero__name"><strong>{level.name}</strong> <span>{level.short}</span></div>
          {/* Every line sits invisibly in the same cell, so the bubble keeps the height of the longest one. */}
          {flyChat && (
            <div className="speech speech--stack">
              <p>{t(`select.speech.${level.id}.${speech}`)}</p>
              {FLY_LEVELS.flatMap((fly) => [0, 1, 2].map((i) => (
                <p key={`${fly.id}.${i}`} className="speech__ghost" aria-hidden="true">{t(`select.speech.${fly.id}.${i}`)}</p>
              )))}
            </div>
          )}
        </div>
      </div>

      <div className="bot-select__section">
        <h3>DROSO-1 <span className="model-subtitle">{t("select.modelStyles")}</span></h3>
        <div className="bot-grid" role="radiogroup" aria-label={t("select.levelAria")}>
          {FLY_LEVELS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={item.id === levelId}
              className={`bot-card${item.id === levelId ? " is-selected" : ""}`}
              onClick={() => choose(item.id)}
              title={`${item.name} — ${item.description}`}
            >
              <span className="bot-card__img" style={{ background: item.tint }}><FlyMascot still variant={item.id} /></span>
              <span className="bot-card__name">{item.card}</span>
              <span className="bot-card__rating">{item.short}</span>
            </button>
          ))}
        </div>
        <p className="bot-select__note">{t("select.ratingNote")}</p>
      </div>

      <div className="bot-select__section">
        <h3>{t("select.playAs")}</h3>
        <div className="side-pick" role="radiogroup" aria-label={t("select.colorAria")}>
          {SIDES.map((item) => (
            <button key={item} type="button" role="radio" aria-checked={side === item} className={side === item ? "is-selected" : ""} onClick={() => setSide(item)} title={t(`side.${item}`)} aria-label={t(`side.${item}`)}>
              <KingIcon side={item} />
            </button>
          ))}
        </div>
      </div>

      <div className="bot-select__section bot-select__row">
        <label className="select">
          <span>{t("select.time")}</span>
          <select value={timeId} onChange={(e) => setTimeId(e.target.value)}>
            {TIME_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.id === "none" ? t("time.none") : option.label}</option>)}
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showThoughts} onChange={(e) => setShowThoughts(e.target.checked)} />
          <span className="toggle__track" />
          <span>{t("select.thoughts")}</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showEval} onChange={(e) => setShowEval(e.target.checked)} />
          <span className="toggle__track" />
          <span>{t("settings.evalBar")}</span>
        </label>
      </div>

      <div className="bot-select__footer">
        <button type="button" className="btn-play" onClick={() => startGame()} disabled={status === "error"}>
          {t("select.play")}
        </button>
      </div>
    </div>
  );
}
