/**
 * Signal flow between the six anatomical groups of the connectome, drawn from the recorded
 * thought as a layered network diagram: the board enters on the left, passes the sensory,
 * projection, integration and output layers, and the decision leaves on the right through the
 * read-out neurons. Every step only the strongest routes are drawn, as smooth curves whose width
 * and pulses follow the drive (inhibition dashed in red). Each region is a block that fills
 * from the bottom with its mean activity.
 */

import { GROUP_COUNT } from "@/ai/fly/brain";
import { brainClock } from "./clock";
import { GROUP_COLORS } from "./CloudView";
import { sampleRow } from "./stats";

type Point = { x: number; y: number };

/** Layer columns, left to right: input, sensory, projection, integration, output, read-out. */
const COLUMNS = [0.065, 0.245, 0.425, 0.6, 0.775, 0.935];
const TOP = 0.34;
const MIDDLE = 0.5;
const BOTTOM = 0.7;
/** Region → [column, row]. */
const NODES: Point[] = [
  { x: COLUMNS[1], y: TOP }, // visual circuits
  { x: COLUMNS[2], y: TOP }, // visual projections
  { x: COLUMNS[3], y: MIDDLE }, // central brain
  { x: COLUMNS[4], y: TOP }, // motor output
  { x: COLUMNS[4], y: BOTTOM }, // ascending pathways
  { x: COLUMNS[1], y: BOTTOM }, // other senses
];
const INPUT: Point = { x: COLUMNS[0], y: MIDDLE };
const OUTPUT: Point = { x: COLUMNS[5], y: MIDDLE };
/** The main pathways, drawn faintly at all times so the diagram reads even before the fly thinks. */
const SKELETON: [number | "in", number | "out"][] = [
  ["in", 0], ["in", 5], [0, 1], [1, 2], [5, 2], [0, 2], [2, 3], [2, 4], [3, 4], [1, "out"], [2, "out"], [3, "out"],
];
const EXCITATORY_SHOWN = 7;
const INHIBITORY_SHOWN = 3;
const GOLD = "#ffd65a";
const INPUT_BLUE = "#8ce2ff";
const INHIBIT = "#f05668";
const SURFACE = "#1b1a17";
const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

function rgba(hex: string, alpha: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

type Curve = [Point, Point, Point, Point];

/**
 * Forward links leave a block on the right and enter the next on the left with horizontal
 * tangents, like the edges of a network diagram. Links inside a column or back against the flow
 * arc around to one side, so both directions of a pair stay apart.
 */
function curve(a: Point, b: Point, ha: number, hb: number, lane = 0): Curve {
  const dx = b.x - a.x;
  if (dx > ha + hb) {
    const p0 = { x: a.x + ha, y: a.y + lane };
    const p3 = { x: b.x - hb, y: b.y + lane };
    const k = (p3.x - p0.x) * 0.5;
    return [p0, { x: p0.x + k, y: p0.y }, { x: p3.x - k, y: p3.y }, p3];
  }
  const side = dx < -1 ? -1 : Math.sign(b.y - a.y) || 1;
  const bow = Math.max(28, Math.abs(dx) * 0.25 + Math.abs(b.y - a.y) * 0.35);
  if (Math.abs(dx) <= 1) {
    // Same column: bow out to the right, lane decides how far.
    const out = bow * 0.8 + lane * 3;
    return [{ x: a.x + ha, y: a.y }, { x: a.x + ha + out, y: a.y }, { x: b.x + hb + out, y: b.y }, { x: b.x + hb, y: b.y }];
  }
  // Backwards: leave from the top or bottom and arc over (or under) the forward links.
  const sy = side * (bow + lane * 4);
  return [{ x: a.x, y: a.y + side * ha }, { x: a.x, y: a.y + sy }, { x: b.x, y: b.y + sy }, { x: b.x, y: b.y + side * hb }];
}

function along([p0, p1, p2, p3]: Curve, u: number): Point {
  const v = 1 - u;
  const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

export class FlowView {
  private ctx: CanvasRenderingContext2D;
  private unsubscribe: () => void;
  private readonly flow = new Float32Array(GROUP_COUNT * GROUP_COUNT * 2);
  private readonly mean = new Float32Array(GROUP_COUNT);
  private readonly readout = new Float32Array(GROUP_COUNT);
  private readonly maxCount: number;
  compact = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly groupNames: string[],
    private readonly groupCounts: number[],
    private readonly text: { board: string; readout: string; move: string; layers: string[] },
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available.");
    this.ctx = ctx;
    this.maxCount = Math.max(1, ...groupCounts);
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
    ctx.clearRect(0, 0, w, h);
    this.sample(t);

    const stats = brainClock.stats;
    const live = !!brainClock.trace;
    const flowMax = stats?.flowMax ?? 1;
    const meanMax = stats?.meanMax ?? 1;
    const readoutMax = stats?.readoutMax ?? 1;
    const time = now / 1000;
    const scale = Math.max(0.72, Math.min(w / 520, h / 300));
    const P = (p: Point): Point => ({ x: p.x * w, y: p.y * h });
    const half = (g: number) => (9 + 6 * Math.sqrt(this.groupCounts[g] / this.maxCount)) * scale;
    const ioHalf = 12 * scale;
    const halfOf = (end: number | "in" | "out") => (typeof end === "number" ? half(end) : ioHalf);
    const pointOf = (end: number | "in" | "out") => P(end === "in" ? INPUT : end === "out" ? OUTPUT : NODES[end]);

    const stroke = ([p0, p1, p2, p3]: Curve) => {
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      ctx.stroke();
    };

    // --- layer guides: a hairline per column, named at the bottom ---
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 4]);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (const x of COLUMNS) {
      ctx.beginPath();
      ctx.moveTo(Math.round(x * w) + 0.5, 22 * scale);
      ctx.lineTo(Math.round(x * w) + 0.5, h - (this.compact ? 8 : 24) * scale);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (!this.compact) {
      COLUMNS.forEach((x, i) => this.label((this.text.layers[i] ?? "").toUpperCase(), x * w, h - 12 * scale, "rgba(255,255,255,0.3)", 8.5 * scale, 500, MONO, 0.8));
    }

    // --- the anatomy at rest: faint, still pathways ---
    ctx.lineCap = "round";
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    for (const [from, to] of SKELETON) stroke(curve(pointOf(from), pointOf(to), halfOf(from), halfOf(to)));

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

    const link = (c: Curve, from: string, to: string, strength: number, dashed = false) => {
      const gradient = ctx.createLinearGradient(c[0].x, c[0].y, c[3].x, c[3].y);
      gradient.addColorStop(0, rgba(from, 0.2 + strength * 0.5));
      gradient.addColorStop(1, rgba(to, 0.2 + strength * 0.5));
      ctx.strokeStyle = gradient;
      ctx.lineWidth = (0.8 + strength * 2.6) * scale;
      if (dashed) ctx.setLineDash([3 * scale, 4 * scale]);
      stroke(c);
      ctx.setLineDash([]);
    };
    const pulses = (c: Curve, color: string, strength: number, count: number, speed: number, seed: number) => {
      ctx.fillStyle = rgba(color, 0.45 + strength * 0.55);
      for (let i = 0; i < count; i++) {
        const p = along(c, (time * speed + i / count + seed * 0.137) % 1);
        ctx.beginPath();
        ctx.arc(p.x, p.y, (1 + strength * 1.3) * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    for (const route of routes) {
      const c = curve(P(NODES[route.s]), P(NODES[route.d]), half(route.s), half(route.d), route.inhibitory ? 3 * scale : 0);
      const from = route.inhibitory ? INHIBIT : GROUP_COLORS[route.s];
      const to = route.inhibitory ? INHIBIT : GROUP_COLORS[route.d];
      link(c, from, to, route.strength, route.inhibitory);
      pulses(c, to, route.strength, 1 + Math.round(route.strength * 2), 0.16 + route.strength * 0.4, route.s * 7 + route.d);
    }

    // --- input from the board, output to the move ---
    const input = live ? Math.min(1, t * 2) : 0;
    const inputPoint = P(INPUT);
    for (const [target, level] of [[0, input], [5, input * 0.7]] as const) {
      if (level <= 0.02) continue;
      const c = curve(inputPoint, P(NODES[target]), ioHalf, half(target));
      link(c, INPUT_BLUE, INPUT_BLUE, level * 0.7);
      pulses(c, INPUT_BLUE, level, 2, 0.5, target);
    }
    const outputPoint = P(OUTPUT);
    let out = 0;
    for (let g = 0; g < GROUP_COUNT; g++) {
      const level = Math.sqrt(this.readout[g] / readoutMax);
      out = Math.max(out, level);
      if (level < 0.12) continue;
      const c = curve(P(NODES[g]), outputPoint, half(g), ioHalf);
      link(c, GROUP_COLORS[g], GOLD, level * 0.7);
      pulses(c, GOLD, level, 2, 0.35 + level * 0.3, g * 3);
    }

    // --- regions: square blocks that fill from the bottom with the group's activity ---
    const block = (x: number, y: number, r: number, color: string, level: number) => {
      const size = r * 2;
      ctx.fillStyle = SURFACE;
      ctx.beginPath();
      ctx.roundRect(x - r, y - r, size, size, 4 * scale);
      ctx.fill();
      if (level > 0.01) {
        ctx.save();
        ctx.clip();
        const top = y + r - size * level;
        const fill = ctx.createLinearGradient(0, top, 0, y + r);
        fill.addColorStop(0, rgba(color, 0.85));
        fill.addColorStop(1, rgba(color, 0.35));
        ctx.fillStyle = fill;
        ctx.fillRect(x - r, top, size, size * level);
        ctx.restore();
      }
      ctx.strokeStyle = rgba(color, 0.55 + level * 0.45);
      ctx.lineWidth = 1.25 * scale;
      ctx.beginPath();
      ctx.roundRect(x - r, y - r, size, size, 4 * scale);
      ctx.stroke();
    };
    for (let g = 0; g < GROUP_COUNT; g++) {
      const { x, y } = P(NODES[g]);
      block(x, y, half(g), GROUP_COLORS[g], live ? Math.min(1, Math.sqrt(this.mean[g] / meanMax)) : 0);
    }

    // --- the move: a gold block with a knight, filling as the read-out does ---
    block(outputPoint.x, outputPoint.y, ioHalf, GOLD, live ? out : 0);
    ctx.fillStyle = out > 0.5 ? "#2a2110" : rgba(GOLD, 0.95);
    ctx.font = `600 ${Math.round(14 * scale)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♞", outputPoint.x, outputPoint.y + 1);

    // --- the board ---
    const size = ioHalf * 2;
    const bx = inputPoint.x - ioHalf;
    const by = inputPoint.y - ioHalf;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(bx, by, size, size, 4 * scale);
    ctx.clip();
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = (i + Math.floor(i / 4)) % 2 ? "#739552" : "#ebecd0";
      ctx.fillRect(bx + (i % 4) * size / 4, by + Math.floor(i / 4) * size / 4, size / 4, size / 4);
    }
    ctx.restore();
    ctx.strokeStyle = rgba(INPUT_BLUE, 0.3 + input * 0.6);
    ctx.lineWidth = 1.25 * scale;
    ctx.beginPath();
    ctx.roundRect(bx - 2, by - 2, size + 4, size + 4, 5 * scale);
    ctx.stroke();

    // --- labels ---
    const name = 10 * scale;
    this.label(this.text.board, inputPoint.x, by + size + 12 * scale, "#c3c2c1", name);
    this.label(this.text.readout, outputPoint.x, outputPoint.y + ioHalf + 12 * scale, GOLD, name);
    for (let g = 0; g < GROUP_COUNT; g++) {
      const { x, y } = P(NODES[g]);
      const r = half(g);
      const lines = this.wrap(this.groupNames[g] ?? "", (COLUMNS[2] - COLUMNS[1]) * w - 8, name);
      lines.forEach((line, i) => this.label(line, x, y + r + (11 + i * 11.5) * scale, "#e4e2de", name));
      if (!this.compact && live) {
        const value = `${(this.mean[g] * 100).toFixed(1)}%`;
        this.label(value, x, y + r + (11 + lines.length * 11.5) * scale, rgba(GROUP_COLORS[g], 0.9), 9 * scale, 500, MONO);
      }
    }
  }

  /** Splits a region name into lines that fit between two columns. */
  private wrap(text: string, width: number, size: number): string[] {
    this.ctx.font = `500 ${Math.max(9, size).toFixed(1)}px "Noto Sans", system-ui, sans-serif`;
    if (this.ctx.measureText(text).width <= width) return [text];
    const words = text.split(" ");
    const lines = [words.shift() ?? ""];
    for (const word of words) {
      const joined = `${lines[lines.length - 1]} ${word}`;
      if (this.ctx.measureText(joined).width <= width) lines[lines.length - 1] = joined;
      else lines.push(word);
    }
    return lines;
  }

  private label(text: string, x: number, y: number, color: string, size: number, weight = 500, family = '"Noto Sans", system-ui, sans-serif', spacing = 0): void {
    const ctx = this.ctx;
    ctx.font = `${weight} ${Math.max(8, size).toFixed(1)}px ${family}`;
    ctx.letterSpacing = `${spacing}px`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // A knockout in the panel colour keeps labels legible where links pass underneath.
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(31,30,27,0.9)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.letterSpacing = "0px";
  }

  dispose(): void {
    this.unsubscribe();
  }
}
