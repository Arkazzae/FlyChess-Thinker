/**
 * Regenerates the README media in docs/media/ from a real session in a real browser:
 * banner.png, gameplay.gif, brain.gif, brain-page.png, review.png.
 *
 *   CHROMIUM_PATH=/usr/bin/chromium pnpm media
 *
 * Needs ffmpeg on PATH. GIFs are 800 px wide at 12 fps with an optimised palette, to stay a few
 * megabytes so GitHub shows them quickly.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { flySvg, FLY_CSS } from "../src/components/flySvg.ts";

const require = createRequire(import.meta.url);
const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(PROJECT, "docs/media");
const VIDEO = join(PROJECT, "reports/video");
const origin = "http://127.0.0.1:5299";
const VIEW = { width: 1280, height: 720 };

const server = spawn(process.execPath, [join(dirname(require.resolve("vite/package.json")), "bin/vite.js"), "--host", "127.0.0.1", "--port", "5299", "--strictPort"], { cwd: PROJECT, stdio: "pipe" });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan", "--disable-vulkan-surface"],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function toGif(input, output, { start, duration, width = 800, fps = 12, colors = 160 }) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(start), "-t", String(duration), "-i", input,
    "-vf", `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    "-loop", "0", output]);
}

/** A recorded page; `mark()` returns seconds since the recording began. */
async function recorded() {
  await rm(VIDEO, { recursive: true, force: true });
  const context = await browser.newContext({ viewport: VIEW, recordVideo: { dir: VIDEO, size: VIEW } });
  const page = await context.newPage();
  const began = Date.now();
  return { context, page, mark: () => (Date.now() - began) / 1000 };
}

async function videoFile() {
  const [file] = (await readdir(VIDEO)).filter((name) => name.endsWith(".webm"));
  return join(VIDEO, file);
}

/** Drag a piece like a person would. */
async function drag(page, from, to) {
  const a = await page.locator(`[data-square="${from}"]`).boundingBox();
  const b = await page.locator(`[data-square="${to}"]`).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 14 });
  await page.mouse.up();
}

async function playerMove(page, preferred) {
  const uci = await page.evaluate(async (list) => {
    const { useGameStore } = await import("/src/state/game.ts");
    const legal = useGameStore.getState().chess.moves({ verbose: true }).map((m) => m.from + m.to);
    return list.find((m) => legal.includes(m)) ?? legal[0];
  }, preferred);
  await drag(page, uci.slice(0, 2), uci.slice(2, 4));
}

async function waitForReply(page, count) {
  await page.waitForFunction((n) => document.querySelectorAll(".move-table__move").length >= n, count, { timeout: 120000 });
}

try {
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(origin)).ok) break; } catch { /* starting */ }
    await wait(100);
  }
  await mkdir(OUT, { recursive: true });

  // --- banner ---
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 400 }, deviceScaleFactor: 1 });
    const nodes = [];
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) nodes.push([rnd() * 1280, rnd() * 400, 1 + rnd() * 2.5, ["#4fc3d9", "#6f8cff", "#b48cff", "#ffd65a"][i % 4]]);
    const links = nodes.map(([x, y], i) => {
      const [x2, y2] = nodes[(i * 7 + 3) % nodes.length];
      return Math.hypot(x2 - x, y2 - y) < 260 ? `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="#b9a8ff" stroke-opacity=".12"/>` : "";
    }).join("");
    await page.setContent(`<!doctype html><html><head>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800&family=Noto+Sans:wght@500;600&display=swap" rel="stylesheet">
      <style>${FLY_CSS}
        body{margin:0;width:1280px;height:400px;overflow:hidden;background:radial-gradient(ellipse at 30% 40%,#2a2440 0%,#15131c 55%,#0d0c11 100%);font-family:"Noto Sans",sans-serif;color:#fff}
        .bg{position:absolute;inset:0}
        .fly{position:absolute;left:120px;top:40px;width:320px;height:320px;filter:drop-shadow(0 20px 40px rgba(0,0,0,.6))}
        .fly svg{width:100%;height:100%}
        .text{position:absolute;left:500px;top:92px}
        h1{margin:0;font-family:Montserrat,sans-serif;font-weight:800;font-size:92px;letter-spacing:-2px;line-height:1}
        h1 b{color:#81b64c}
        p{margin:16px 0 26px;font-size:28px;color:#d9d6f0;font-weight:500}
        .chips{display:flex;gap:12px}
        .chips span{padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-size:17px;font-weight:600;color:#e8e6f5}
      </style></head><body>
      <svg class="bg" viewBox="0 0 1280 400">${links}${nodes.map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity=".55"/>`).join("")}</svg>
      <div class="fly fly-still">${flySvg("banner", { variant: "mysl" })}</div>
      <div class="text"><h1>Fly<b>Chess</b></h1><p>Play chess against the brain of a fruit fly.</p>
      <div class="chips"><span>163,903 real neurons</span><span>6.2 M connections</span><span>Runs in your browser</span></div></div>
      </body></html>`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, "banner.png") });
    await page.close();
    console.log("banner.png");
  }

  // --- gameplay: a real game against the Thinker, with its thoughts on the board ---
  {
    const { context, page, mark } = await recorded();
    await page.addInitScript(() => {
      localStorage.setItem("fly-chess-thinker:ui:v2", JSON.stringify({ level: "mysl", side: "w", timeId: "none", showThoughts: true, showEval: true }));
    });
    await page.goto(origin);
    await page.locator(".preloader").waitFor({ state: "detached", timeout: 180000 });
    await wait(600);
    const start = mark();
    await page.locator(".btn-play").click();
    await wait(700);
    const plan = [["e2e4"], ["g1f3"], ["f1c4", "f1b5", "b1c3"], ["e1g1", "b1c3", "d2d3"]];
    for (let i = 0; i < plan.length; i++) {
      await playerMove(page, plan[i]);
      await waitForReply(page, (i + 1) * 2);
      await wait(900);
    }
    const end = mark();
    await page.screenshot({ path: join(OUT, "game.png") });
    await context.close();
    toGif(await videoFile(), join(OUT, "gameplay.gif"), { start, duration: Math.min(16, end - start) });
    console.log("gameplay.gif");
  }

  // --- brain: the recorded propagation on the full page, then the review ---
  {
    const { context, page, mark } = await recorded();
    await page.goto(origin);
    await page.locator(".preloader").waitFor({ state: "detached", timeout: 180000 });
    await page.locator(".btn-play").click();
    await playerMove(page, ["e2e4"]);
    await waitForReply(page, 2);
    await playerMove(page, ["g1f3"]);
    await waitForReply(page, 4);
    await page.locator(".sidebar__brain").click();
    await page.locator(".brain-page").waitFor();
    await wait(800);
    const start = mark();
    await page.locator(".brain-timeline__play").click();
    await wait(4200);
    const end = mark();
    await page.screenshot({ path: join(OUT, "brain-page.png") });

    await page.locator(".brain-page__header .btn").click();
    await page.locator(".panel-tabs button").nth(0).click();
    await page.locator('.game-tab__controls button[aria-label="Resign"]').click();
    await page.locator(".game-over__actions .btn--green").click({ timeout: 10000 });
    await page.waitForFunction(() => [...document.querySelectorAll(".review-summary strong")].every((e) => /\d/.test(e.textContent ?? "")), null, { timeout: 90000 });
    await page.locator(".review-controls .btn").nth(3).click();
    await page.locator(".review-controls .btn").nth(3).click();
    await page.locator(".review-controls .btn").nth(3).click();
    await wait(2500);
    await page.screenshot({ path: join(OUT, "review.png") });
    console.log("review.png");
    // The video is only complete once the context is closed.
    await context.close();
    toGif(await videoFile(), join(OUT, "brain.gif"), { start, duration: end - start, colors: 192 });
    console.log("brain.gif");
  }
} finally {
  await browser.close();
  server.kill();
  await rm(VIDEO, { recursive: true, force: true });
}
