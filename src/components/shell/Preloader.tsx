/**
 * Full-screen loading screen: downloads the brain (~31 MB), the piece images, the sounds and the
 * fonts before the game appears. A small neuron field lights up from the optic lobes inwards as
 * the download progresses, the way the board reaches the fly's eyes first.
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
import { GROUP_COLORS } from "@/brain/CloudView";

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

interface Node { x: number; y: number; color: string; order: number; links: number[] }

/** A brain-shaped field: two optic lobes, the central brain and the nerve cord below. */
function buildField(): Node[] {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const parts = [
    { cx: -0.64, cy: -0.1, rx: 0.26, ry: 0.36, color: GROUP_COLORS[0], count: 34 },
    { cx: 0.64, cy: -0.1, rx: 0.26, ry: 0.36, color: GROUP_COLORS[0], count: 34 },
    { cx: -0.34, cy: -0.14, rx: 0.12, ry: 0.22, color: GROUP_COLORS[1], count: 12 },
    { cx: 0.34, cy: -0.14, rx: 0.12, ry: 0.22, color: GROUP_COLORS[1], count: 12 },
    { cx: 0, cy: -0.12, rx: 0.28, ry: 0.3, color: GROUP_COLORS[2], count: 36 },
    { cx: 0, cy: 0.52, rx: 0.12, ry: 0.36, color: GROUP_COLORS[4], count: 22 },
  ];
  const nodes: Node[] = [];
  for (const part of parts) {
    for (let i = 0; i < part.count; i++) {
      const angle = random() * Math.PI * 2;
      const r = Math.sqrt(random());
      const x = part.cx + Math.cos(angle) * r * part.rx;
      const y = part.cy + Math.sin(angle) * r * part.ry;
      // Light order: outer optic lobes first, then inwards, the nerve cord last.
      const order = (1 - Math.min(1, Math.abs(x))) + (y > 0.2 ? 0.6 : 0) + random() * 0.15;
      nodes.push({ x, y, color: part.color, order, links: [] });
    }
  }
  nodes.forEach((node, i) => {
    const nearest = nodes
      .map((other, j) => ({ j, d: (other.x - node.x) ** 2 + (other.y - node.y) ** 2 }))
      .filter((entry) => entry.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    node.links = nearest.map((entry) => entry.j);
  });
  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  sorted.forEach((node, rank) => { node.order = rank / (sorted.length - 1); });
  return nodes;
}

function NeuronField({ progress }: { progress: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const nodes = buildField();
    const pulses: { from: number; to: number; t: number }[] = [];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let shown = 0;
    let frame = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      shown += (progressRef.current - shown) * Math.min(1, dt * 4);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // Portrait screens: the brain sits in the upper part, the text below it.
      const portrait = h > w * 1.15;
      const scale = portrait ? Math.min(w / 2.2, h * 0.21) : Math.min(w / 2.2, h / 2.1);
      const centerY = portrait ? h * 0.25 : h / 2 - scale * 0.1;
      const dot = Math.max(0.6, Math.min(1, scale / 280));
      const X = (x: number) => w / 2 + x * scale;
      const Y = (y: number) => centerY + y * scale;
      const lit = (node: Node) => Math.max(0, Math.min(1, (shown - node.order) * 12 + 0.02));
      ctx.lineWidth = 1;
      for (const node of nodes) {
        for (const j of node.links) {
          const other = nodes[j];
          const level = Math.min(lit(node), lit(other));
          ctx.strokeStyle = `rgba(200, 190, 255, ${0.05 + level * 0.18})`;
          ctx.beginPath();
          ctx.moveTo(X(node.x), Y(node.y));
          ctx.lineTo(X(other.x), Y(other.y));
          ctx.stroke();
        }
      }
      if (!reduced && Math.random() < 0.6) {
        const litNodes = nodes.map((node, i) => (lit(node) > 0.9 ? i : -1)).filter((i) => i >= 0);
        if (litNodes.length) {
          const from = litNodes[Math.floor(Math.random() * litNodes.length)];
          pulses.push({ from, to: nodes[from].links[Math.floor(Math.random() * 3)], t: 0 });
        }
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pulse = pulses[i];
        pulse.t += dt * 2.2;
        if (pulse.t >= 1) { pulses.splice(i, 1); continue; }
        const a = nodes[pulse.from];
        const b = nodes[pulse.to];
        ctx.fillStyle = `rgba(255, 236, 170, ${1 - pulse.t})`;
        ctx.beginPath();
        ctx.arc(X(a.x + (b.x - a.x) * pulse.t), Y(a.y + (b.y - a.y) * pulse.t), 2.2 * dot, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const node of nodes) {
        const level = lit(node);
        const flicker = reduced ? 1 : 0.85 + 0.15 * Math.sin(now / 300 + node.x * 20);
        ctx.globalAlpha = 0.18 + level * 0.82 * flicker;
        ctx.fillStyle = node.color;
        ctx.shadowColor = node.color;
        ctx.shadowBlur = level * 12 * dot;
        ctx.beginPath();
        ctx.arc(X(node.x), Y(node.y), (2 + level * 2.4) * dot, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvasRef} className="preloader__field" aria-hidden="true" />;
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
      <NeuronField progress={progress} />
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
