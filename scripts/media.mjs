/**
 * Regenerates the README media in docs/media/ from a real session in a real browser:
 * banner.png, gameplay.gif, brain.gif, brain-page.png, review.png. The brain is also rendered
 * as a full-HD video for presentations, reports/media/brain.mp4 (not committed).
 *
 *   CHROMIUM_PATH=/usr/bin/chromium pnpm media
 *   MEDIA_ONLY=brain CHROMIUM_PATH=/usr/bin/chromium pnpm media    # banner, gameplay or brain
 *
 * Needs ffmpeg on PATH. Both GIFs are 800 × 450 (16:9) at 12 fps with an optimised palette, a few
 * megabytes each, so GitHub shows them quickly and at the same size.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { flySvg, FLY_CSS } from "../src/components/flySvg.ts";

const require = createRequire(import.meta.url);
const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(PROJECT, "docs/media");
const VIDEO = join(PROJECT, "reports/video");
const FRAMES = join(PROJECT, "reports/frames");
const PRESENT = join(PROJECT, "reports/media");
const origin = "http://127.0.0.1:5299";
const VIEW = { width: 1280, height: 720 };
const only = process.env.MEDIA_ONLY?.split(",").map((name) => name.trim());
const want = (name) => !only || only.includes(name);

/** The spinning brain: one full turn, during which the recorded thought plays three times. */
const SPIN = { seconds: 12.6, thoughts: 3, fps: 30, width: 1920, height: 1080 };

const server = spawn(process.execPath, [join(dirname(require.resolve("vite/package.json")), "bin/vite.js"), "--host", "127.0.0.1", "--port", "5299", "--strictPort"], { cwd: PROJECT, stdio: "pipe" });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan", "--disable-vulkan-surface"],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** `input` is ffmpeg's input arguments, e.g. ["-ss", "2", "-t", "8", "-i", "clip.webm"]. */
function toGif(input, output, { width = 800, fps = 12, colors = 160, crop = null } = {}) {
  const cut = crop ? `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},` : "";
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...input,
    "-vf", `${cut}fps=${fps},scale=${width}:${Math.round((width * 9) / 16)}:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
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

  // --- banner: the real brain, lit by a real thought, over a board in perspective ---
  if (want("banner")) {
    // 1. A render of the connectome right after the fly has thought about a position.
    const app = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
    await app.goto(origin);
    await app.locator(".preloader").waitFor({ state: "detached", timeout: 180000 });
    await app.locator(".btn-play").click();
    await playerMove(app, ["e2e4"]);
    await waitForReply(app, 2);
    await app.locator(".sidebar__brain").click();
    await app.locator(".bp").waitFor();
    await app.locator(".brain-timeline__play").click();
    await wait(4200); // the ten recorded steps have played; the brain holds its final state
    const brainPng = await app.locator(".bp-cloud canvas").evaluate((canvas) => canvas.toDataURL("image/png"));
    await app.close();

    // 2. The banner itself.
    const page = await browser.newPage({ viewport: { width: 1280, height: 400 }, deviceScaleFactor: 2 });
    const pieces = [["br", 1, 1], ["bn", 3, 0], ["bk", 5, 1], ["bp", 2, 2], ["bp", 6, 2], ["wp", 4, 4], ["wn", 5, 5], ["wq", 2, 6], ["wk", 6, 7], ["wr", 0, 7]];
    const squares = Array.from({ length: 64 }, (_, i) => `<i class="${(Math.floor(i / 8) + i) % 2 ? "d" : "l"}"></i>`).join("");
    const pieceImgs = pieces.map(([p, x, y]) => `<img src="${origin}/pieces/${p}.png" style="left:${x * 12.5}%;top:${y * 12.5}%">`).join("");
    await page.setContent(`<!doctype html><html><head>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800&family=Noto+Sans:wght@500;600&display=swap" rel="stylesheet">
      <style>${FLY_CSS}
        *{box-sizing:border-box}
        body{margin:0;width:1280px;height:400px;overflow:hidden;position:relative;color:#fff;font-family:"Noto Sans",sans-serif;
          background:radial-gradient(ellipse 70% 120% at 78% 45%,#241c14 0%,#15110d 55%,#0c0a08 100%)}
        .brain{position:absolute;right:20px;top:0;width:560px;height:400px;background:url(${brainPng}) center/contain no-repeat;
          mix-blend-mode:screen;opacity:.95;
          -webkit-mask-image:radial-gradient(ellipse 62% 66% at 50% 50%,#000 55%,transparent 82%);mask-image:radial-gradient(ellipse 62% 66% at 50% 50%,#000 55%,transparent 82%)}
        .floor{position:absolute;left:-40px;bottom:-250px;width:760px;height:760px;perspective:900px}
        .board{position:absolute;inset:0;transform:rotateX(64deg) rotateZ(-8deg);transform-origin:50% 60%;
          -webkit-mask-image:linear-gradient(0deg,#000 20%,transparent 70%);mask-image:linear-gradient(0deg,#000 20%,transparent 70%)}
        .grid{position:absolute;inset:0;display:grid;grid-template-columns:repeat(8,1fr);border-radius:6px;overflow:hidden;opacity:.72}
        .grid i.l{background:#ebecd0}.grid i.d{background:#739552}
        .board img{position:absolute;width:12.5%;height:12.5%;transform:rotateX(-64deg) translateY(-35%);transform-origin:50% 100%;opacity:1;filter:drop-shadow(0 6px 6px rgba(0,0,0,.5))}
        .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(12,10,8,.2) 0%,rgba(12,10,8,.55) 40%,rgba(12,10,8,0) 70%)}
        .fly{position:absolute;left:84px;top:78px;width:230px;height:230px;filter:drop-shadow(0 18px 30px rgba(0,0,0,.65))}
        .fly svg{width:100%;height:100%}
        .text{position:absolute;left:340px;top:104px}
        h1{margin:0;font-family:Montserrat,sans-serif;font-weight:800;font-size:88px;letter-spacing:-2px;line-height:1;text-shadow:0 6px 30px rgba(0,0,0,.6)}
        h1 b{color:#81b64c}
        p{margin:14px 0 22px;font-size:25px;color:#efe6d6;font-weight:500;text-shadow:0 2px 12px rgba(0,0,0,.7)}
        .chips{display:flex;gap:10px}
        .chips span{padding:7px 13px;border-radius:999px;background:rgba(20,16,12,.7);border:1px solid rgba(255,236,200,.18);font-size:15.5px;font-weight:600;color:#efe6d6;backdrop-filter:blur(4px)}
        .chips b{color:#e0a33a}
      </style></head><body>
      <div class="brain"></div>
      <div class="floor"><div class="board"><div class="grid">${squares}</div>${pieceImgs}</div></div>
      <div class="shade"></div>
      <div class="fly fly-still">${flySvg("banner", { variant: "thinker" })}</div>
      <div class="text"><h1>Fly<b>Chess</b></h1><p>Play chess against the brain of a fruit fly.</p>
      <div class="chips"><span><b>163,903</b> real neurons</span><span><b>6.2 M</b> connections</span><span>runs in your browser</span></div></div>
      </body></html>`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, "banner.png") });
    await page.close();
    console.log("banner.png");
  }

  // --- gameplay: a real game against the Thinker, with its thoughts on the board ---
  if (want("gameplay")) {
    const { context, page, mark } = await recorded();
    await page.addInitScript(() => {
      localStorage.setItem("fly-chess-thinker:ui:v2", JSON.stringify({ level: "thinker", side: "w", timeId: "none", showThoughts: true, showEval: true }));
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
    toGif(["-ss", String(start), "-t", String(Math.min(16, end - start)), "-i", await videoFile()], join(OUT, "gameplay.gif"));
    console.log("gameplay.gif");
  }

  // --- brain: the connectome spinning full screen, then the brain page and the review ---
  if (want("brain")) {
    const page = await browser.newPage({ viewport: VIEW });
    await page.goto(origin);
    await page.locator(".preloader").waitFor({ state: "detached", timeout: 180000 });
    await page.locator(".btn-play").click();
    await playerMove(page, ["e2e4"]);
    await waitForReply(page, 2);
    await playerMove(page, ["g1f3"]);
    await waitForReply(page, 4);
    await page.locator(".sidebar__brain").click();
    await page.locator(".bp").waitFor();

    // The cloud alone fills the window; a scripted camera turns it once while the fly's last
    // thought plays, so every frame is exact and the clip loops without a seam.
    await page.setViewportSize({ width: SPIN.width, height: SPIN.height });
    const stage = await page.addStyleTag({ content: `
      .bp-cloud .brain-cloud { position: fixed; inset: 0; height: auto; z-index: 1000; }
      .brain-cloud__legend, .brain-cloud__reset { display: none; }` });
    await page.evaluate(async (spin) => {
      const { CloudView } = await import("/src/brain/CloudView.ts");
      const { brainClock } = await import("/src/brain/clock.ts");
      const cycle = spin.seconds / spin.thoughts;
      window.__spinTime = 0;
      CloudView.director = () => ({
        yaw: -0.5 + (2 * Math.PI * window.__spinTime) / spin.seconds,
        pitch: 0.16,
        zoom: 0.52,
        // The thought spreads for ~3 s, then holds until the next one starts.
        t: Math.min(brainClock.steps, (window.__spinTime % cycle) * 3.2),
      });
    }, SPIN);
    await rm(FRAMES, { recursive: true, force: true });
    await mkdir(FRAMES, { recursive: true });
    const frames = Math.round(SPIN.seconds * SPIN.fps);
    for (let i = 0; i < frames; i++) {
      const png = await page.evaluate(async (time) => {
        window.__spinTime = time;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return document.querySelector(".bp-cloud canvas").toDataURL("image/png");
      }, i / SPIN.fps);
      await writeFile(join(FRAMES, `${String(i).padStart(4, "0")}.png`), Buffer.from(png.split(",")[1], "base64"));
    }
    const sequence = ["-framerate", String(SPIN.fps), "-i", join(FRAMES, "%04d.png")];
    await mkdir(PRESENT, { recursive: true });
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...sequence, "-c:v", "libx264", "-preset", "slow", "-crf", "16",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(PRESENT, "brain.mp4")]);
    console.log("reports/media/brain.mp4");
    toGif(sequence, join(OUT, "brain.gif"), { colors: 192 });
    console.log("brain.gif");
    await page.evaluate(async () => {
      const { CloudView } = await import("/src/brain/CloudView.ts");
      CloudView.director = null;
    });
    await stage.evaluate((node) => node.remove());
    await page.setViewportSize(VIEW);

    await page.evaluate(() => document.querySelector(".brain-timeline__play").click());
    await wait(4200);
    await page.screenshot({ path: join(OUT, "brain-page.png") });

    await page.locator(".bp-hero__side .btn").click();
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
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
  await rm(VIDEO, { recursive: true, force: true });
  await rm(FRAMES, { recursive: true, force: true });
}
