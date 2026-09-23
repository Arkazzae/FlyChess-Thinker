/**
 * Full-screen loading screen: downloads the brain (~51.3 MB), the piece images, the sounds and the
 * fonts before the game appears.
 */

import { useEffect, useRef, useState } from "react";
import { getFlyEngine } from "@/ai/fly/engine";
import { useFlyStore } from "@/state/fly";
import { useUiStore } from "@/state/ui";
import { FLY_LEVELS, getFlyLevel } from "@/ai/bots/levels";
import { flyAvatarUrl } from "@/ai/bots/avatars";
import { preloadSounds } from "@/sounds";
import { formatLocale, useTranslation } from "@/i18n";
import { FlyMascot } from "@/components/FlyMascot";

const PIECES = ["wp", "wn", "wb", "wr", "wq", "wk", "bp", "bn", "bb", "br", "bq", "bk"];
const FACTS = 10;
/** Share of the bar that belongs to the brain; the rest is pieces, sounds and fonts. */
const BRAIN_SHARE = 0.9;

function loadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = image.onerror = () => resolve();
    image.src = src;
  });
}

export function Preloader({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const level = getFlyLevel(useUiStore((s) => s.level));
  const status = useFlyStore((s) => s.status);
  const error = useFlyStore((s) => s.error);
  const download = useFlyStore((s) => s.download);
  const [assets, setAssets] = useState(0);
  const [assetsTotal] = useState(PIECES.length + FLY_LEVELS.length + 3);
  const [leaving, setLeaving] = useState(false);
  const [fact, setFact] = useState(0);
  const started = useRef(performance.now());

  useEffect(() => {
    const tick = () => setAssets((n) => n + 1);
    for (const piece of PIECES) void loadImage(`pieces/${piece}.png`).then(tick);
    for (const fly of FLY_LEVELS) void loadImage(flyAvatarUrl(fly.id)).then(tick);
    void loadImage("avatars/player.svg").then(tick);
    void preloadSounds().then(tick);
    void (document.fonts?.ready ?? Promise.resolve()).then(tick);
    getFlyEngine().init().catch(() => undefined);
    const timer = setInterval(() => setFact((n) => (n + 1) % FACTS), 3800);
    return () => clearInterval(timer);
  }, []);

  const brainDone = status === "ready" || status === "thinking";
  const brainPart = brainDone ? 1 : download.total ? download.loaded / download.total : 0;
  const progress = BRAIN_SHARE * brainPart + (1 - BRAIN_SHARE) * Math.min(1, assets / assetsTotal);
  const done = brainDone && assets >= assetsTotal;

  useEffect(() => {
    if (!done || leaving) return;
    // Never flash: stay at least a moment, then fade out.
    const wait = Math.max(0, 900 - (performance.now() - started.current));
    const timer = setTimeout(() => {
      setLeaving(true);
      setTimeout(onDone, 450);
    }, wait);
    return () => clearTimeout(timer);
  }, [done, leaving, onDone]);

  const mb = (bytes: number) => (bytes / 1e6).toLocaleString(formatLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const stage = status === "error" ? t("preload.error")
    : done ? t("preload.ready")
    : brainDone ? t("preload.assets")
    : download.stage === "connectome" ? t("preload.connectome")
    : download.stage === "weights" ? t("preload.weights")
    : download.stage === "wiring" ? t("preload.wiring")
    : t("preload.manifest");

  return (
    <div className={`preloader${leaving ? " is-leaving" : ""}`} role="status" aria-live="polite">
      <div className="preloader__content">
        <div className="preloader__fly"><FlyMascot variant={level.id} thinking={!done && status !== "error"} /></div>
        <h1 className="preloader__title">Fly<b>Chess</b></h1>
        <p className="preloader__stage">{stage}</p>
        <div className="preloader__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <i style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="preloader__numbers">
          <span>{Math.round(progress * 100)}%</span>
          {download.total > 0 && !brainDone && <span>{mb(download.loaded)} / {mb(download.total)} MB</span>}
        </p>
        {status === "error" ? (
          <div className="preloader__error">
            <p>{error}</p>
            <div>
              <button type="button" className="btn btn--green" onClick={() => getFlyEngine().init().catch(() => undefined)}>{t("preload.retry")}</button>
              <button type="button" className="btn" onClick={onDone}>{t("preload.skip")}</button>
            </div>
          </div>
        ) : (
          <p className="preloader__fact" key={fact}>{t(`preload.fact.${fact}`)}</p>
        )}
      </div>
    </div>
  );
}
