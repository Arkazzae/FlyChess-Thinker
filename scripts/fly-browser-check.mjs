/**
 * Real-browser check of FlyChess: start a game from the bot screen, play a move,
 * verify the recorded propagation, hint and takeback, the brain views, compare WebGPU with the
 * CPU path numerically and save screenshots to reports/.
 *
 *   pnpm test:fly:browser
 *
 * Linux test harness only: the app itself never forces browser or driver flags.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origin = "http://127.0.0.1:5297";
const server = spawn(process.execPath, [join(dirname(require.resolve("vite/package.json")), "bin/vite.js"), "--host", "127.0.0.1", "--port", "5297", "--strictPort"], { cwd: PROJECT, stdio: "pipe" });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: process.platform === "linux" ? ["--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan", "--disable-vulkan-surface"] : [],
});
const report = { checks: [], generatedAt: new Date().toISOString() };
try {
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(origin)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(origin);
  const shot = (name) => page.screenshot({ path: join(PROJECT, `reports/${name}.png`) });
  const moveCount = () => page.locator(".move-table__move").count();

  // --- preloader: the brain and assets load before the bot screen appears ---
  await page.locator(".btn-play").waitFor({ timeout: 15000 });
  await page.locator(".preloader").waitFor({ state: "detached", timeout: 180000 });
  report.brainStatus = await page.locator(".sidebar__model").textContent();
  assert.match(report.brainStatus ?? "", /fly-v6/, "the v6 model is loaded");
  assert.equal((await page.locator(".right-panel__header h2").textContent())?.trim(), "Play the Fly", "English by default");
  await shot("1-lobby");
  await page.locator(".sidebar__lang").click();
  assert.equal((await page.locator(".right-panel__header h2").textContent())?.trim(), "Graj z muchą", "switches to Polish");
  await shot("1-lobby-pl");
  await page.locator(".sidebar__lang").click();
  assert.equal((await page.locator(".btn-play").textContent())?.trim(), "Play", "switches back to English");
  report.checks.push("i18n: English by default, EN ↔ PL switch works");
  await page.locator(".side-pick button").first().click(); // white
  await page.locator(".btn-play").click();
  report.checks.push("preloader: brain (fly-v6) and assets loaded, game started as White");

  // --- the player moves, the fly thinks (recorded propagation) and replies ---
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".move-table__move").length >= 1, null, { timeout: 5000 });
  await page.waitForFunction(async () => {
    const { useFlyStore } = await import("/src/state/fly.ts");
    return !!useFlyStore.getState().trace;
  }, null, { timeout: 60000, polling: 100 });
  await page.waitForTimeout(250);
  await shot("2-thinking");
  await page.waitForFunction(() => document.querySelectorAll(".move-table__move").length >= 2, null, { timeout: 120000 });
  report.trace = await page.evaluate(async () => {
    const { useFlyStore } = await import("/src/state/fly.ts");
    const { trace, anatomy, roles, thought } = useFlyStore.getState();
    const n = anatomy.neurons;
    const frameSum = (k) => { let s = 0; for (let i = k * n; i < (k + 1) * n; i++) s += trace.frames[i]; return s; };
    let flowTotal = 0;
    for (const v of trace.flows) flowTotal += v;
    let readout = 0;
    for (const r of roles) if (r === 3) readout++;
    return {
      steps: trace.steps, frames: trace.frames.length / n, traceMs: Math.round(trace.traceMs), restSum: frameSum(0), step1Sum: frameSum(1), finalSum: frameSum(trace.steps),
      flowTotal, readoutNeurons: readout, chosen: thought?.decision.move, evaluations: thought?.decision.evaluations,
    };
  });
  assert.equal(report.trace.frames, 11, "11 activity frames (rest + 10 steps)");
  assert.equal(report.trace.restSum, 0, "frame 0 is the resting brain");
  assert.ok(report.trace.finalSum > report.trace.step1Sum && report.trace.step1Sum > 0, "activity spreads over the steps");
  assert.ok(report.trace.flowTotal > 0, "group-to-group flow is recorded");
  report.checks.push(`game: fly replied (${report.trace.chosen}) after recording ${report.trace.frames} frames in ${report.trace.traceMs} ms`);
  report.moves = await page.locator(".move-table__move").allTextContents();
  await page.waitForTimeout(400);
  await shot("3-game");

  // --- hint from the same brain, then take the move back ---
  await page.locator('.game-tab__controls button[aria-label="Hint"]').click();
  await page.locator(".board-overlay").waitFor({ timeout: 60000 });
  report.checks.push("hint: the fly drew a suggestion for the player");
  await shot("4-hint");
  await page.locator('.game-tab__controls button[aria-label="Take back"]').click();
  assert.equal(await moveCount(), 0, "takeback returns to the start");
  report.checks.push("takeback: one full move undone");

  // --- play on and look at the brain ---
  await page.locator('[data-square="d2"]').click();
  await page.locator('[data-square="d4"]').click();
  await page.locator(".panel-tabs button").nth(1).click();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator(".brain-cloud__empty").count(), 0, "the 3-D connectome renders (WebGL)");
  await shot("5-brain-tab");
  await page.waitForFunction(() => document.querySelectorAll(".move-table__move, .thoughts__list li").length > 0, null, { timeout: 120000 });
  await page.locator(".sidebar__brain").click();
  await page.locator(".bp").waitFor();
  await page.locator(".brain-timeline__play").click();
  await page.waitForTimeout(1500);
  assert.equal(await page.locator(".brain-cloud__empty").count(), 0, "the full-page connectome renders (WebGL)");
  report.cloudPixels = await page.evaluate(() => {
    const canvas = document.querySelector(".brain-cloud canvas");
    const probe = document.createElement("canvas");
    probe.width = 64; probe.height = 64;
    const ctx = probe.getContext("2d");
    ctx.drawImage(canvas, 0, 0, 64, 64);
    const data = ctx.getImageData(0, 0, 64, 64).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 120) lit++;
    return lit;
  });
  assert.ok(report.cloudPixels > 20, "neurons are visible in the point cloud");
  await shot("6-brain-page");
  report.checks.push("brain: tab and full page render the animated views");
  await page.locator(".bp-hero__side .btn").click();

  // --- game review: resign, then replay with Stockfish verdicts and the brain on every position ---
  await page.locator(".panel-tabs button").nth(0).click();
  await page.waitForFunction(() => document.querySelectorAll(".move-table__move").length >= 2, null, { timeout: 120000 });
  await page.locator('.game-tab__controls button[aria-label="Resign"]').click();
  await page.locator(".game-over").waitFor({ timeout: 10000 });
  await shot("7-game-over");
  await page.locator(".game-over__actions .btn--green").click();
  await page.locator(".review-tab").waitFor({ timeout: 10000 });
  // Both sides have moved, so both get an accuracy once Stockfish has been through the game.
  await page.waitForFunction(() => [...document.querySelectorAll(".review-summary strong")].every((e) => /\d/.test(e.textContent ?? "")),
    null, { timeout: 90000, polling: 250 });
  await page.locator(".review-controls .btn").nth(3).click(); // next move
  await page.waitForFunction(async () => {
    const { useFlyStore } = await import("/src/state/fly.ts");
    const { useGameStore } = await import("/src/state/game.ts");
    const history = useGameStore.getState().chess.history({ verbose: true });
    return useFlyStore.getState().trace?.fen === history[0].after;
  }, null, { timeout: 30000, polling: 200 });
  report.review = await page.evaluate(() => ({
    accuracy: [...document.querySelectorAll(".review-summary strong")].map((e) => e.textContent),
    move: document.querySelector(".review-move")?.textContent,
    marks: document.querySelectorAll(".move-mark").length,
  }));
  assert.ok(report.review.accuracy.every((a) => a && a !== "–"), "both sides get an accuracy");
  await page.waitForTimeout(1500);
  await shot("8-review");
  report.checks.push("review: Stockfish rated every move and the brain replayed the shown position");

  // --- the older fly-v4: pick it, start a game, and it answers with its own brain ---
  await page.locator(".game-tab__controls .btn", { hasText: /New Game|Nowa partia/ }).click().catch(async () => {
    await page.locator(".panel-tabs button").nth(0).click();
    await page.locator(".game-tab__controls .btn", { hasText: /New Game|Nowa partia/ }).click();
  });
  await page.locator(".gen-pick button").nth(1).click();
  await page.locator(".btn-play").click();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".move-table__move").length >= 2, null, { timeout: 120000 });
  report.v4 = await page.evaluate(async () => {
    const { getFlyEngine } = await import("/src/ai/fly/engine.ts");
    return { model: getFlyEngine().model, sidebar: document.querySelector(".sidebar__model b")?.textContent, reply: document.querySelectorAll(".move-table__move")[1]?.textContent };
  });
  assert.equal(report.v4.model, "fly-v4", "the v4 fly plays with the fly-v4 brain");
  report.checks.push(`fly-v4: loaded on demand and replied ${report.v4.reply}`);

  // --- numerics: WebGPU against the CPU reference on the real connectome ---
  report.gpu = await page.evaluate(async () => {
    const { FlyBrain } = await import("/src/ai/fly/brain.ts");
    const { Connectome, fetchVerified } = await import("/src/ai/fly/connectome.ts");
    const { FlyWeights } = await import("/src/ai/fly/weights.ts");
    const { GpuPropagator } = await import("/src/ai/fly/gpu.ts");
    const { encodeFen } = await import("/src/ai/fly/encoding.ts");
    const manifest = await (await fetch("./data/mcns/manifest.json")).json();
    const model = await (await fetch("./data/flybrain/model.json")).json();
    const graph = new Connectome(await fetchVerified("./data/mcns/connectome.bin.gz", manifest.sha256, 150e6));
    const weights = new FlyWeights(await fetchVerified("./data/flybrain/weights.bin.gz", model.sha256, 150e6));
    const brain = new FlyBrain(graph, weights);
    let gpu;
    try { gpu = await GpuPropagator.create(brain); } catch (error) { return { skipped: true, reason: String(error?.message ?? error) }; }
    const fens = ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1"];
    let worst = 0, worstLogit = 0;
    const cpuMs = [], gpuMs = [];
    for (const fen of fens) {
      const board = encodeFen(fen);
      let start = performance.now();
      const cpu = brain.evaluate(board);
      const cpuActivity = brain.activity.slice();
      cpuMs.push(performance.now() - start);
      start = performance.now();
      const viaGpu = await brain.evaluateWith((input, steps) => gpu.propagate(input, steps), board);
      gpuMs.push(performance.now() - start);
      for (let i = 0; i < cpuActivity.length; i++) worst = Math.max(worst, Math.abs(cpuActivity[i] - brain.activity[i]));
      for (let i = 0; i < cpu.policy.length; i++) worstLogit = Math.max(worstLogit, Math.abs(cpu.policy[i] - viaGpu.policy[i]));
    }
    const adapter = gpu.adapterName;
    gpu.dispose();
    const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    return { skipped: false, adapter, worstActivityDifference: worst, worstLogitDifference: worstLogit, cpuMsPerEvaluation: Math.round(median(cpuMs)), gpuMsPerEvaluation: Math.round(median(gpuMs)) };
  });
  if (!report.gpu.skipped) {
    assert.ok(report.gpu.worstActivityDifference < 1e-4, `GPU activity differs from CPU by ${report.gpu.worstActivityDifference}`);
    assert.ok(report.gpu.worstLogitDifference < 5e-3, `GPU logits differ from CPU by ${report.gpu.worstLogitDifference}`);
    report.checks.push("numerics: WebGPU matches the CPU path on the full connectome");
  } else {
    report.checks.push(`numerics: skipped, no hardware WebGPU (${report.gpu.reason})`);
  }
  assert.deepEqual(errors, [], "no uncaught page errors");
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = String(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  await mkdir(join(PROJECT, "reports"), { recursive: true });
  await writeFile(join(PROJECT, "reports/fly-browser.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  server.kill();
}
