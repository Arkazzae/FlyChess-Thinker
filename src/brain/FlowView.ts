/**
 * Signal flow between the six anatomical groups of the connectome, drawn from the recorded
 * thought. Every step only the strongest routes are shown: glowing ribbons coloured from the
 * sending to the receiving region, with comets travelling along them as fast and as often as the
 * drive is strong (inhibition in red). Regions are plain discs that fill with their mean activity. The board
 * enters on the left through the eyes and the other senses; the decision leaves on the right
 * through the read-out neurons.
 */

import { GROUP_COUNT } from "@/ai/fly/brain";
import { brainClock } from "./clock";
import { GROUP_COLORS } from "./CloudView";
import { sampleRow } from "./stats";

type Point = { x: number; y: number };

/** Left to right, roughly the path a board takes through the fly: eyes → brain → motor output. */
const NODES: Point[] = [
  { x: 0.25, y: 0.36 }, // visual circuits
  { x: 0.45, y: 0.24 }, // visual projections
  { x: 0.6, y: 0.54 }, // central brain
  { x: 0.79, y: 0.32 }, // motor output
  { x: 0.77, y: 0.8 }, // ventral nerve cord
  { x: 0.27, y: 0.76 }, // other senses
];
const INPUT: Point = { x: 0.07, y: 0.54 };
/** The main pathways, drawn faintly at all times so the diagram reads even before the fly thinks. */
const SKELETON: [number | "in", number | "out"][] = [
  ["in", 0], ["in", 5], [0, 1], [1, 2], [5, 2], [0, 2], [2, 3], [2, 4], [3, 4], [1, "out"], [2, "out"], [3, "out"],
];
const OUTPUT: Point = { x: 0.93, y: 0.52 };
const EXCITATORY_SHOWN = 7;
const INHIBITORY_SHOWN = 3;
const GOLD = "#ffd65a";
const INPUT_BLUE = "#8ce2ff";
const INHIBIT = "#ff5a6e";

function rgba(hex: string, alpha: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

function control(a: Point, b: Point, bend: number): Point {
  // Perpendicular bow: A→B and B→A curve to opposite sides, so both directions stay readable.
  return { x: (a.x + b.x) / 2 - (b.y - a.y) * bend, y: (a.y + b.y) / 2 + (b.x - a.x) * bend };
}

function along(a: Point, c: Point, b: Point, u: number): Point {
  const v = 1 - u;
  return { x: v * v * a.x + 2 * v * u * c.x + u * u * b.x, y: v * v * a.y + 2 * v * u * c.y + u * u * b.y };
}

export class FlowView {
  private ctx: CanvasRenderingContext2D;
  private unsubscribe: () => void;
  private readonly flow = new Float32Array(GROUP_COUNT * GROUP_COUNT * 2);
  private readonly mean = new Float32Array(GROUP_COUNT);
  private readonly readout = new Float32Array(GROUP_COUNT);
  private readonly maxCount: number;
  private readonly stars: { x: number; y: number; r: number; phase: number }[] = [];
  compact = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly groupNames: string[],
    private readonly groupCounts: number[],
    private readonly text: { board: string; readout: string; move: string },
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available.");
    this.ctx = ctx;
    this.maxCount = Math.max(1, ...groupCounts);
    let seed = 11;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) this.stars.push({ x: random(), y: random(), r: 0.4 + random() * 0.9, phase: random() * 6.28 });
    this.unsubscribe = brainClock.subscribe((t, now) => this.draw(t, now));
  }

  private sample(t: number): void {
    const trace = brainClock.trace;
    const stats = brainClock.stats;
    this.flow.fill(0);
    this.mean.fill(0);
    this.readout.fill(0);
    if (!trace || !stats) return;
    const steps = trace.steps;
    // Flow during the transition k → k+1 is flows[k]; ease in from the previous step.
    const k = Math.min(steps - 1, Math.floor(Math.max(0, t)));
    const f = Math.max(0, Math.min(1, (t - k) * 1.6));
    const size = this.flow.length;
    for (let i = 0; i < size; i++) {
      const now = trace.flows[k * size + i];
      const before = k > 0 ? trace.flows[(k - 1) * size + i] : 0;
      this.flow[i] = t >= steps ? now : before + (now - before) * f;
    }
    sampleRow(stats.groupMean, GROUP_COUNT, t, steps + 1, this.mean);
    sampleRow(stats.readout, GROUP_COUNT, t, steps + 1, this.readout);
  }

  private draw(t: number, now: number): void {
    const { canvas, ctx } = this;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    this.sample(t);

    const stats = brainClock.stats;
    const live = !!brainClock.trace;
    const flowMax = stats?.flowMax ?? 1;
    const meanMax = stats?.meanMax ?? 1;
    const readoutMax = stats?.readoutMax ?? 1;
    const time = now / 1000;
    const scale = Math.max(0.7, Math.min(w / 520, h / 300));
    const P = (p: Point): Point => ({ x: p.x * w, y: p.y * h });
    const radius = (g: number) => (9 + 17 * Math.sqrt(this.groupCounts[g] / this.maxCount)) * scale;

    // --- backdrop: faint stars that twinkle with the overall activity ---
    let total = 0;
    for (const v of this.mean) total += v;
    const energy = live ? Math.min(1, total / Math.max(1e-6, meanMax * 2.5)) : 0.15;
    for (const star of this.stars) {
      const alpha = (0.08 + 0.14 * energy) * (0.6 + 0.4 * Math.sin(time * 1.3 + star.phase));
      ctx.fillStyle = `rgba(200,210,255,${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- the anatomy at rest: faint, still pathways ---
    ctx.lineCap = "round";
    ctx.lineWidth = 1.2 * scale;
    for (const [from, to] of SKELETON) {
      const a = P(from === "in" ? INPUT : NODES[from]);
      const b = P(to === "out" ? OUTPUT : NODES[to]);
      const c = control(a, b, 0.1);
      ctx.strokeStyle = "rgba(190, 185, 215, 0.14)";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.stroke();
    }

    // --- the strongest routes this step ---
    const routes: { s: number; d: number; strength: number; inhibitory: boolean }[] = [];
    for (const inhibitory of [false, true]) {
      const offset = inhibitory ? GROUP_COUNT * GROUP_COUNT : 0;
      const list: typeof routes = [];
      for (let s = 0; s < GROUP_COUNT; s++) {
        for (let d = 0; d < GROUP_COUNT; d++) {
          if (s === d) continue;
          const strength = Math.sqrt(this.flow[offset + s * GROUP_COUNT + d] / flowMax);
          if (strength > 0.06) list.push({ s, d, strength, inhibitory });
        }
      }
      list.sort((a, b) => b.strength - a.strength);
      routes.push(...list.slice(0, inhibitory ? INHIBITORY_SHOWN : EXCITATORY_SHOWN));
    }

    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const ribbon = (a: Point, b: Point, bend: number, from: string, to: string, strength: number, dashed = false): Point => {
      const c = control(a, b, bend);
      const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      gradient.addColorStop(0, rgba(from, 0.12 + strength * 0.4));
      gradient.addColorStop(1, rgba(to, 0.12 + strength * 0.4));
      ctx.strokeStyle = gradient;
      if (dashed) ctx.setLineDash([2 * scale, 6 * scale]);
      for (const [width, alpha] of [[4.5, 0.22], [1.4, 1]] as const) {
        ctx.globalAlpha = alpha;
        ctx.lineWidth = (0.6 + strength * width) * scale;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      return c;
    };
    const comets = (a: Point, c: Point, b: Point, color: string, strength: number, count: number, speed: number, seed: number) => {
      for (let i = 0; i < count; i++) {
        const head = (time * speed + i / count + seed * 0.137) % 1;
        for (let tail = 0; tail < 7; tail++) {
          const u = head - tail * 0.018;
          if (u < 0) break;
          const p = along(a, c, b, u);
          const fade = 1 - tail / 7;
          ctx.fillStyle = rgba(tail === 0 ? "#ffffff" : color, (0.25 + strength * 0.75) * fade);
          ctx.beginPath();
          ctx.arc(p.x, p.y, (tail === 0 ? 2.2 : 1.6) * scale * (0.6 + strength * 0.6) * fade + 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    for (const route of routes) {
      const a = P(NODES[route.s]);
      const b = P(NODES[route.d]);
      const from = route.inhibitory ? INHIBIT : GROUP_COLORS[route.s];
      const to = route.inhibitory ? INHIBIT : GROUP_COLORS[route.d];
      const c = ribbon(a, b, route.inhibitory ? 0.32 : 0.16, from, to, route.strength, route.inhibitory);
      comets(a, c, b, to, route.strength, 1 + Math.round(route.strength * 3), 0.18 + route.strength * 0.45, route.s * 7 + route.d);
    }

    // --- input from the board, output to the move ---
    const input = live ? Math.min(1, t * 2) : 0;
    const inputPoint = P(INPUT);
    for (const [target, level] of [[NODES[0], input], [NODES[5], input * 0.7]] as const) {
      if (level <= 0.02) continue;
      const b = P(target);
      const c = ribbon(inputPoint, b, 0.05, INPUT_BLUE, INPUT_BLUE, level * 0.8);
      comets(inputPoint, c, b, INPUT_BLUE, level, 3, 0.55, target.y * 10);
    }
    const outputPoint = P(OUTPUT);
    let out = 0;
    for (let g = 0; g < GROUP_COUNT; g++) {
      const level = Math.sqrt(this.readout[g] / readoutMax);
      out = Math.max(out, level);
      if (level < 0.12) continue;
      const a = P(NODES[g]);
      const c = ribbon(a, outputPoint, 0.06, GROUP_COLORS[g], GOLD, level * 0.7);
      comets(a, c, outputPoint, GOLD, level, 2, 0.4 + level * 0.3, g * 3);
    }

    ctx.globalCompositeOperation = "source-over";

    // --- regions: a dark disc with a coloured ring, filling up with the group's activity ---
    for (let g = 0; g < GROUP_COUNT; g++) {
      const { x, y } = P(NODES[g]);
      const r = radius(g);
      const level = live ? Math.min(1, Math.sqrt(this.mean[g] / meanMax)) : 0;
      const color = GROUP_COLORS[g];
      ctx.fillStyle = "#16151c";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (level > 0.01) {
        ctx.fillStyle = rgba(color, 0.35 + level * 0.55);
        ctx.beginPath();
        ctx.arc(x, y, r * (0.2 + level * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = rgba(color, 0.95);
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // --- the move: a gold disc with a knight, brighter as the read-out fills ---
    const starR = 13 * scale;
    ctx.fillStyle = rgba(GOLD, 0.35 + out * 0.65);
    ctx.beginPath();
    ctx.arc(outputPoint.x, outputPoint.y, starR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a2110";
    ctx.font = `700 ${Math.round(16 * scale)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♞", outputPoint.x, outputPoint.y + 1);

    // --- the board ---
    const size = 28 * scale;
    const bx = inputPoint.x - size / 2;
    const by = inputPoint.y - size / 2;
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = (i + Math.floor(i / 4)) % 2 ? "#739552" : "#ebecd0";
      ctx.fillRect(bx + (i % 4) * size / 4, by + Math.floor(i / 4) * size / 4, size / 4, size / 4);
    }
    ctx.strokeStyle = rgba(INPUT_BLUE, 0.35 + input * 0.6);
    ctx.lineWidth = 1.5 * scale;
    ctx.strokeRect(bx - 2, by - 2, size + 4, size + 4);

    // --- labels ---
    this.label(this.text.board, inputPoint.x, by + size + 13 * scale, "#c9c7c3", 10.5 * scale);
    this.label(this.text.readout, outputPoint.x, outputPoint.y + starR + 12 * scale, GOLD, 10.5 * scale);
    for (let g = 0; g < GROUP_COUNT; g++) {
      const { x, y } = P(NODES[g]);
      const r = radius(g);
      this.label(this.groupNames[g] ?? "", x, y + r + 12 * scale, "#ecebea", 11 * scale);
      if (!this.compact && live) this.label(`${(this.mean[g] * 100).toFixed(1)}%`, x, y + r + 25 * scale, rgba(GROUP_COLORS[g], 0.95), 10 * scale, 500);
    }
  }

  private label(text: string, x: number, y: number, color: string, size: number, weight = 650): void {
    const ctx = this.ctx;
    ctx.font = `${weight} ${Math.max(9, size).toFixed(1)}px "Noto Sans", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,.85)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  }

  dispose(): void {
    this.unsubscribe();
  }
}
