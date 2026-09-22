/**
 * Production-bundle check: serve `dist/` with `vite preview` and play the
 * first move against the real connectome. This is what Vercel serves, so it
 * is the only check that exercises the bundled module worker and the
 * `base: "./"` asset resolution.
 *
 *   pnpm test:preview
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
const origin = "http://127.0.0.1:4173";
const vite = join(dirname(require.resolve("vite/package.json")), "bin/vite.js");
const server = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], { cwd: PROJECT, stdio: "pipe" });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const report = { checks: [], generatedAt: new Date().toISOString() };

try {
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(origin)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);

  await page.locator(".btn-play").waitFor({ timeout: 15000 });
  await page.locator(".preloader").waitFor({ state: "detached", timeout: 180000 });
  await page.locator(".side-pick button").nth(2).click(); // Black: the fly moves first
  report.checks.push("production bundle: connectome downloaded and verified");

  // No horizontal scroll on a normal laptop viewport.
  report.laptopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(report.laptopOverflow <= 0, `lobby overflows horizontally by ${report.laptopOverflow}px at 1366px`);
  await page.screenshot({ path: join(PROJECT, "reports/preview-lobby-1366.png") });

  await page.locator(".btn-play").click();
  // The bundled module worker must start and produce a move.
  await page.waitForFunction(() => document.querySelectorAll(".move-table__move").length > 0, null, { timeout: 120000 });
  report.firstMove = await page.locator(".move-table__move").first().textContent();
  report.brainStrip = await page.locator(".brain-strip").textContent();
  await page.screenshot({ path: join(PROJECT, "reports/preview-game-1366.png") });
  report.checks.push(`production bundle: worker played ${report.firstMove?.trim()}`);

  // Phone viewport: the board must fit without sideways scrolling.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = [];
  phone.on("pageerror", (error) => phoneErrors.push(error.message));
  await phone.goto(origin);
  await phone.locator(".preloader").waitFor({ state: "detached", timeout: 180000 });
  const overflow = () => phone.evaluate(() => {
    const main = document.querySelector(".app__main");
    return Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, main ? main.scrollWidth - main.clientWidth : 0);
  });
  report.phoneOverflow = await overflow();
  await phone.screenshot({ path: join(PROJECT, "reports/preview-lobby-390.png") });
  assert.ok(report.phoneOverflow <= 0, `lobby overflows horizontally by ${report.phoneOverflow}px at 390px`);
  await phone.locator(".sidebar__brain").click();
  await phone.locator(".brain-page").waitFor();
  report.phoneBrainOverflow = await overflow();
  await phone.screenshot({ path: join(PROJECT, "reports/preview-brain-390.png") });
  assert.ok(report.phoneBrainOverflow <= 0, `brain page overflows horizontally by ${report.phoneBrainOverflow}px at 390px`);
  report.checks.push("phone: bot screen and brain page fit without horizontal scroll");

  assert.deepEqual(errors, [], "no uncaught page errors");
  assert.deepEqual(phoneErrors, [], "no uncaught page errors on phone");
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = String(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  await mkdir(join(PROJECT, "reports"), { recursive: true });
  await writeFile(join(PROJECT, "reports/preview-check.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  server.kill();
}
