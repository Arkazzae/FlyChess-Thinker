import { useEffect, useRef, useState } from "react";
import { useFlyStore } from "@/state/fly";
import { brainClock } from "@/brain/clock";
import { t } from "@/i18n";

function describe(step: number, steps: number, front: Uint8Array | undefined): string {
  if (step <= 0) return t("timeline.rest");
  if (step === 1) return t("timeline.first");
  if (step >= steps) return t("timeline.final");
  return front ? t("timeline.front", { where: t(`group.${front[step]}`).toLowerCase() }) : t("timeline.spreading");
}

/** Play, pause and scrub through the 10 propagation steps. */
export function BrainTimeline() {
  const trace = useFlyStore((s) => s.trace);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const steps = trace?.steps ?? 10;

  useEffect(() => brainClock.subscribe((t) => {
    if (fillRef.current) fillRef.current.style.width = `${(t / brainClock.steps) * 100}%`;
    const rounded = Math.floor(t + 1e-3);
    setStep((previous) => (previous === rounded ? previous : rounded));
    const isPlaying = brainClock.mode !== "paused";
    setPlaying((previous) => (previous === isPlaying ? previous : isPlaying));
  }), []);

  const seekFromPointer = (clientX: number) => {
    const track = trackRef.current;
    if (!track || !trace) return;
    const rect = track.getBoundingClientRect();
    brainClock.seek(((clientX - rect.left) / rect.width) * steps);
  };

  return (
    <div className="brain-timeline">
      <div className="brain-timeline__row">
        <button
          type="button"
          className="brain-timeline__play"
          disabled={!trace}
          onClick={() => (playing ? brainClock.pause() : brainClock.play())}
          aria-label={playing ? t("timeline.pause") : t("timeline.play")}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div
          ref={trackRef}
          className="brain-timeline__track"
          role="slider"
          tabIndex={0}
          aria-label={t("timeline.aria")}
          aria-valuemin={0}
          aria-valuemax={steps}
          aria-valuenow={step}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            seekFromPointer(e.clientX);
          }}
          onPointerMove={(e) => { if (e.buttons & 1) seekFromPointer(e.clientX); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") brainClock.seek(Math.floor(brainClock.t) + 1);
            if (e.key === "ArrowLeft") brainClock.seek(Math.ceil(brainClock.t) - 1);
          }}
        >
          <div className="brain-timeline__fill" ref={fillRef} />
          {Array.from({ length: steps + 1 }, (_, k) => (
            <i key={k} className={k <= step ? "is-past" : ""} style={{ left: `${(k / steps) * 100}%` }} />
          ))}
        </div>
        <output className="brain-timeline__step">{t("timeline.step", { step: Math.min(step, steps), steps })}</output>
      </div>
      <p className="brain-timeline__caption">
        {trace ? describe(step, steps, brainClock.stats?.front) : t("timeline.waiting")}
      </p>
    </div>
  );
}
