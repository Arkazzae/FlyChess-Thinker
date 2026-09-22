import { useMemo } from "react";
import { FlyMascot } from "@/components/FlyMascot";
import { useTranslation } from "@/i18n";
import { FLY_LEVELS, getFlyLevel } from "@/ai/bots/levels";
import { useFlyStore } from "@/state/fly";
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
  const status = useFlyStore((s) => s.status);
  const level = getFlyLevel(levelId);
  const { t } = useTranslation();
  // A new line every time a different fly is picked.
  const speech = useMemo(() => Math.floor(Math.random() * 3), [level.id]);

  return (
    <div className="bot-select">
      <div className="bot-hero">
        <div className="bot-hero__portrait" style={{ background: level.tint }}>
          <FlyMascot still variant={level.id} />
        </div>
        <div className="speech">
          <p>{t(`select.speech.${level.id}.${speech}`)}</p>
        </div>
      </div>
      <div className="bot-select__title">
        <strong>{level.name}</strong> <span>({level.rating})</span>
        <p>{level.description}</p>
      </div>

      <div className="bot-select__section">
        <h3>{t("select.model")}</h3>
        <div className="bot-grid" role="radiogroup" aria-label={t("select.levelAria")}>
          {FLY_LEVELS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={item.id === levelId}
              className={`bot-card${item.id === levelId ? " is-selected" : ""}`}
              onClick={() => setLevel(item.id)}
              title={`${item.name} (${item.rating}) — ${item.short}`}
            >
              <span className="bot-card__img" style={{ background: item.tint }}><FlyMascot still variant={item.id} /></span>
              <span className="bot-card__name">{item.card}</span>
              <span className="bot-card__rating">{item.rating}</span>
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
