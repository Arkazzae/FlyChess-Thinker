/**
 * Chess clock logic.
 * Manages time for both players with increment support.
 */

import type { PieceColor, TimeControl } from "./types";

export interface ClockState {
  w: number; // ms remaining
  b: number;
  running: PieceColor | null; // whose clock is ticking, null = paused
  lastTick: number; // timestamp of last update
}

export function createClock(tc: TimeControl): ClockState {
  return {
    w: tc.initial * 1000,
    b: tc.initial * 1000,
    running: null,
    lastTick: 0,
  };
}

export function startClock(clock: ClockState, side: PieceColor): ClockState {
  return {
    ...clock,
    running: side,
    lastTick: Date.now(),
  };
}

export function stopClock(clock: ClockState): ClockState {
  if (!clock.running) return clock;
  const elapsed = Date.now() - clock.lastTick;
  return {
    ...clock,
    [clock.running]: Math.max(0, clock[clock.running] - elapsed),
    running: null,
    lastTick: 0,
  };
}

/**
 * Switch clock to other side and add increment.
 */
export function switchClock(
  clock: ClockState,
  increment: number
): ClockState {
  if (!clock.running) return clock;

  const elapsed = Date.now() - clock.lastTick;
  const current = clock.running;
  const other: PieceColor = current === "w" ? "b" : "w";
  const remaining = Math.max(0, clock[current] - elapsed);

  return {
    w: current === "w" ? remaining + increment * 1000 : clock.w,
    b: current === "b" ? remaining + increment * 1000 : clock.b,
    running: other,
    lastTick: Date.now(),
  };
}

/**
 * Get current remaining time (accounts for elapsed since last tick).
 */
export function getTimeRemaining(clock: ClockState, side: PieceColor): number {
  if (clock.running === side) {
    const elapsed = Date.now() - clock.lastTick;
    return Math.max(0, clock[side] - elapsed);
  }
  return clock[side];
}

/**
 * Check if a side has flagged (ran out of time).
 */
export function isFlagged(clock: ClockState, side: PieceColor): boolean {
  return getTimeRemaining(clock, side) <= 0;
}

/**
 * Format milliseconds to mm:ss or m:ss.t for low time.
 */
export function formatTime(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (ms < 20000) {
    // Under 20s: show tenths
    const tenths = Math.floor((ms % 1000) / 100);
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// ── Time control presets ──

export const TIME_PRESETS: { label: string; tc: TimeControl; category: string }[] = [
  { label: "1+0", tc: { initial: 60, increment: 0 }, category: "Bullet" },
  { label: "2+1", tc: { initial: 120, increment: 1 }, category: "Bullet" },
  { label: "3+0", tc: { initial: 180, increment: 0 }, category: "Blitz" },
  { label: "3+2", tc: { initial: 180, increment: 2 }, category: "Blitz" },
  { label: "5+0", tc: { initial: 300, increment: 0 }, category: "Blitz" },
  { label: "5+3", tc: { initial: 300, increment: 3 }, category: "Blitz" },
  { label: "10+0", tc: { initial: 600, increment: 0 }, category: "Rapid" },
  { label: "15+10", tc: { initial: 900, increment: 10 }, category: "Rapid" },
  { label: "∞", tc: { initial: 0, increment: 0 }, category: "Unlimited" },
];

export function isUnlimited(tc: TimeControl): boolean {
  return tc.initial === 0 && tc.increment === 0;
}
