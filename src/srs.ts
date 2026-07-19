import type { KpDepth, Rating, SrsState } from "./types.js";

/**
 * SM-2 variant scheduler for knowledge points.
 *
 * Pure functions only — callers (the store) own persistence. Intervals follow
 * 1d -> 3d -> 7d -> interval*ease; "again" resets to 1d and lowers ease so a
 * forgotten KP comes back sooner and more often.
 */

const DAY_MS = 86_400_000;
const EASE_MIN = 1.3;
const EASE_MAX = 3.0;
const EASE_START = 2.5;
/** Interval ceiling — beyond a year the KP is effectively mastered. */
const INTERVAL_MAX_DAYS = 365;

function clampEase(value: number): number {
  return Math.min(EASE_MAX, Math.max(EASE_MIN, Math.round(value * 100) / 100));
}

/** Fresh SRS state: due immediately so a new KP can enter its first round. */
export function initialSrs(now: Date = new Date()): SrsState {
  return {
    reps: 0,
    lapses: 0,
    ease: EASE_START,
    intervalDays: 0,
    dueAt: now.toISOString(),
    lastRating: null
  };
}

/** Apply one rating and return the next SRS state. */
export function rateSrs(prev: SrsState, rating: Rating, now: Date = new Date()): SrsState {
  let { reps, lapses, ease, intervalDays } = prev;

  switch (rating) {
    case "again":
      lapses += 1;
      reps = 0;
      ease = clampEase(ease - 0.2);
      intervalDays = 1;
      break;
    case "hard":
      reps += 1;
      ease = clampEase(ease - 0.15);
      intervalDays = Math.max(1, intervalDays * 1.2);
      break;
    case "good":
      reps += 1;
      intervalDays = reps === 1 ? 1 : reps === 2 ? 3 : reps === 3 ? 7 : intervalDays * ease;
      break;
    case "easy":
      reps += 1;
      ease = clampEase(ease + 0.1);
      intervalDays = Math.max(1, (intervalDays || 1) * ease * 1.3);
      break;
  }

  intervalDays = Math.min(INTERVAL_MAX_DAYS, Math.round(intervalDays * 10) / 10);
  return {
    reps,
    lapses,
    ease,
    intervalDays,
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
    lastRating: rating
  };
}

/**
 * Depth progression: promote one level every 2 consecutive successes until
 * targetDepth; a lapse demotes one level (never below 1).
 */
export function nextDepth(
  currentDepth: KpDepth,
  targetDepth: KpDepth,
  rating: Rating,
  repsAfterRating: number
): KpDepth {
  if (rating === "again") {
    return Math.max(1, currentDepth - 1) as KpDepth;
  }
  if (
    (rating === "good" || rating === "easy") &&
    currentDepth < targetDepth &&
    repsAfterRating >= 2 &&
    repsAfterRating % 2 === 0
  ) {
    return (currentDepth + 1) as KpDepth;
  }
  return currentDepth;
}
