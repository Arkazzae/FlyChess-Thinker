import { useEffect, useMemo } from "react";
import { Chess } from "chess.js";
import { useGameStore } from "@/state/game";
import { useFlyStore } from "@/state/fly";
import { accuracy, reviewMoves, startReview, useReviewStore, winPercent, type MoveClass, type PositionEval } from "@/ai/review";
import { getFlyEngine } from "@/ai/fly/engine";
import { useTranslation } from "@/i18n";
import { BrainCloud } from "@/components/brain/BrainCloud";
import { BrainTimeline } from "@/components/brain/BrainTimeline";
import { FlyThoughts } from "@/components/brain/FlyThoughts";
import { IconChevron } from "@/components/shell/Icons";
import { MoveTable } from "./MoveTable";

/** Long enough for the brain view to play the recorded propagation of each position. */
const STEP_MS = 3800;

/** Stockfish's UCI move in SAN for the position it was found in. */
function sanOf(fen: string, uci: string): string | null {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return null;
  }
}

function evalText(evaluation: PositionEval | null): string {
  if (!evaluation) return "…";
  if (evaluation.mate !== null) return evaluation.mate === 0 ? "#" : `${evaluation.mate > 0 ? "+" : "−"}M${Math.abs(evaluation.mate)}`;
  const pawns = (evaluation.cp ?? 0) / 100;
  return `${pawns >= 0 ? "+" : "−"}${Math.abs(pawns).toFixed(1)}`;
}

/** White's winning chances over the game; click to jump to a move. */
function EvalGraph({ evals, classes, current, onSelect }: {
  evals: (PositionEval | null)[];
  classes: (MoveClass | undefined)[];
  current: number;
  onSelect: (ply: number) => void;
}) {
  const n = Math.max(1, evals.length - 1);
  const known = evals.map((evaluation, i) => (evaluation ? { x: (i / n) * 100, y: 100 - winPercent(evaluation) } : null));
  const points = known.filter((p): p is { x: number; y: number } => !!p);
  const area = points.length ? `M0,100 ${points.map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")} L${points.at(-1)!.x.toFixed(2)},100 Z` : "";
  return (
    <svg
      className="eval-graph"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSelect(Math.round(((e.clientX - rect.left) / rect.width) * n));
      }}
      role="img"
    >
      <rect width="100" height="100" fill="#403d39" />
      {area && <path d={area} fill="#f0f0ee" />}
      <line x1="0" x2="100" y1="50" y2="50" stroke="#8b8987" strokeWidth=".6" vectorEffect="non-scaling-stroke" />
      <line x1={(current / n) * 100} x2={(current / n) * 100} y1="0" y2="100" stroke="#e0a33a" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {classes.map((cls, i) => {
        const point = known[i + 1];
        if (!point || !cls || !["blunder", "mistake"].includes(cls)) return null;
        return <circle key={i} cx={point.x} cy={point.y} r="1.6" className={`eval-graph__dot is-${cls}`} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

/** Replay of the finished game: Stockfish's verdicts, and the fly's brain on every position. */
export function ReviewTab() {
  const { t } = useTranslation();
  const chess = useGameStore((s) => s.chess);
  const moves = useGameStore((s) => s.moves);
  const myColor = useGameStore((s) => s.myColor);
  const viewPly = useGameStore((s) => s.viewPly);
  const setViewPly = useGameStore((s) => s.setViewPly);
  const thoughts = useFlyStore((s) => s.thoughts);
  const { status, fens, evals, autoplay, setAutoplay } = useReviewStore();
  const current = viewPly ?? moves.length;
  const history = useMemo(() => chess.history({ verbose: true }), [chess, moves.length]);

  useEffect(() => { void startReview(); }, []);

  const reviewed = useMemo(() => reviewMoves(fens, evals), [fens, evals]);
  const classes = reviewed.map((move) => move?.cls);
  const flyColor = myColor === "w" ? "b" : "w";
  const yourAccuracy = myColor ? accuracy(reviewed, myColor) : null;
  const flyAccuracy = accuracy(reviewed, flyColor);
  const done = evals.filter(Boolean).length;

  // The brain view follows the replay: every shown position is recorded again.
  const shownFen = current === 0 ? history[0]?.before : history[current - 1]?.after;
  useEffect(() => {
    if (!shownFen) return;
    const timer = setTimeout(() => void getFlyEngine().trace(shownFen), 180);
    return () => clearTimeout(timer);
  }, [shownFen]);

  useEffect(() => {
    if (!autoplay) return;
    if (current >= moves.length) { setAutoplay(false); return; }
    const timer = setTimeout(() => setViewPly(current + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [autoplay, current, moves.length, setAutoplay, setViewPly]);

  const move = current > 0 ? reviewed[current - 1] : null;
  const played = current > 0 ? history[current - 1] : null;
  const byFly = played && played.color === flyColor;
  const recorded = byFly ? thoughts[played.before] : undefined;
  const bestSan = move?.best && move.cls !== "best" && played ? sanOf(played.before, move.best) : null;

  return (
    <div className="review-tab">
      <div className="review-summary">
        <div><span>{t("review.you")}</span><strong>{yourAccuracy === null ? "–" : yourAccuracy.toFixed(1)}</strong></div>
        <div className="review-summary__status">
          {status === "running" ? t("review.analysing", { done, total: evals.length }) : t("review.accuracy")}
        </div>
        <div><span>{t("review.fly")}</span><strong>{flyAccuracy === null ? "–" : flyAccuracy.toFixed(1)}</strong></div>
      </div>
      <EvalGraph evals={evals} classes={classes} current={current} onSelect={(ply) => { setAutoplay(false); setViewPly(ply); }} />

      <div className={`review-move${move ? ` is-${move.cls}` : ""}`}>
        {played ? (
          <>
            <strong>{Math.ceil(current / 2)}.{played.color === "b" ? ".." : ""} {played.san}</strong>
            <span>{byFly ? t("review.byFly") : t("review.byYou")}</span>
            {move && <em>{t(`review.class.${move.cls}`)}</em>}
            <output>{evalText(evals[current] ?? null)}</output>
            {bestSan && <p>{t("review.bestWas", { move: bestSan })}</p>}
          </>
        ) : (
          <><strong>{t("game.startPosition")}</strong><output>{evalText(evals[0] ?? null)}</output></>
        )}
      </div>

      <div className="review-brain">
        <BrainCloud />
        <BrainTimeline />
      </div>
      {recorded && (
        <section className="panel-section">
          <h3>{t("review.flyThought")}</h3>
          <FlyThoughts recorded={recorded} limit={4} />
        </section>
      )}
      <section className="panel-section review-moves">
        <MoveTable classes={classes} />
      </section>

      <div className="review-controls">
        <button type="button" className="btn" onClick={() => { setAutoplay(false); setViewPly(0); }} aria-label={t("game.first")}><IconChevron dir="first" /></button>
        <button type="button" className="btn" onClick={() => { setAutoplay(false); setViewPly(current - 1); }} aria-label={t("game.prev")}><IconChevron dir="left" /></button>
        <button type="button" className="btn btn--green review-controls__play" onClick={() => {
          if (!autoplay && current >= moves.length) setViewPly(0);
          setAutoplay(!autoplay);
        }}>{autoplay ? t("review.pause") : t("review.play")}</button>
        <button type="button" className="btn" onClick={() => { setAutoplay(false); setViewPly(current + 1); }} aria-label={t("game.next")}><IconChevron dir="right" /></button>
        <button type="button" className="btn" onClick={() => { setAutoplay(false); setViewPly(null); }} aria-label={t("game.last")}><IconChevron dir="last" /></button>
      </div>
    </div>
  );
}
