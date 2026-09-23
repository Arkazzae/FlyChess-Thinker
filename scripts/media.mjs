/**
 * Regenerates the README media in docs/media/ from a real session in a real browser:
 * gameplay.gif, brain.gif, brain-page.png. The brain is also rendered
 * as a full-HD video for presentations, reports/media/brain.mp4 (not committed).
 *
 *   CHROMIUM_PATH=/usr/bin/chromium pnpm media
 *   MEDIA_ONLY=brain CHROMIUM_PATH=/usr/bin/chromium pnpm media    # gameplay or brain
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

  // --- brain: the connectome spinning full screen, then the brain page ---
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
        zoom: 0.95,
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

    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
  await rm(VIDEO, { recursive: true, force: true });
  await rm(FRAMES, { recursive: true, force: true });
}
