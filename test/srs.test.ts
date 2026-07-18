import test from "node:test";
import assert from "node:assert/strict";
import { initialSrs, nextDepth, rateSrs } from "../src/srs.js";
import type { SrsState } from "../src/types.js";

const NOW = new Date("2026-07-16T12:00:00Z");
const DAY_MS = 86_400_000;

function daysUntilDue(state: SrsState, from: Date): number {
	return (Date.parse(state.dueAt) - from.getTime()) / DAY_MS;
}

test("initialSrs is due immediately and never rated", () => {
	const s = initialSrs(NOW);
	assert.equal(s.lastRating, null);
	assert.equal(s.reps, 0);
	assert.equal(s.lapses, 0);
	assert.equal(s.ease, 2.5);
	assert.equal(s.dueAt, NOW.toISOString());
});

test("good sequence follows 1d -> 3d -> 7d -> interval*ease", () => {
	let s = initialSrs(NOW);
	s = rateSrs(s, "good", NOW);
	assert.equal(s.intervalDays, 1);
	s = rateSrs(s, "good", NOW);
	assert.equal(s.intervalDays, 3);
	s = rateSrs(s, "good", NOW);
	assert.equal(s.intervalDays, 7);
	s = rateSrs(s, "good", NOW);
	assert.equal(s.intervalDays, 17.5); // 7 * 2.5
	assert.equal(s.reps, 4);
	assert.ok(Math.abs(daysUntilDue(s, NOW) - 17.5) < 1e-6);
});

test("again resets reps, sets a 1-day interval, and lowers ease", () => {
	let s = initialSrs(NOW);
	s = rateSrs(s, "good", NOW);
	s = rateSrs(s, "good", NOW);
	s = rateSrs(s, "again", NOW);
	assert.equal(s.reps, 0);
	assert.equal(s.lapses, 1);
	assert.equal(s.intervalDays, 1);
	assert.equal(s.ease, 2.3);
	assert.equal(s.lastRating, "again");
});

test("hard shrinks growth and never drops below a 1-day interval", () => {
	let s = initialSrs(NOW);
	s = rateSrs(s, "hard", NOW);
	assert.equal(s.intervalDays, 1); // max(1, 0 * 1.2)
	assert.equal(s.ease, 2.35);
});

test("easy grows faster and raises ease", () => {
	let s = initialSrs(NOW);
	s = rateSrs(s, "good", NOW); // 1d
	s = rateSrs(s, "easy", NOW);
	assert.equal(s.ease, 2.6);
	assert.equal(s.intervalDays, 3.4); // 1 * 2.6 * 1.3 rounded to 0.1
});

test("ease clamps to [1.3, 3.0]", () => {
	let s = initialSrs(NOW);
	for (let i = 0; i < 20; i++) s = rateSrs(s, "again", NOW);
	assert.equal(s.ease, 1.3);
	for (let i = 0; i < 30; i++) s = rateSrs(s, "easy", NOW);
	assert.equal(s.ease, 3.0);
});

test("interval caps at 365 days even under repeated easy ratings", () => {
	let s = initialSrs(NOW);
	for (let i = 0; i < 30; i++) s = rateSrs(s, "easy", NOW);
	assert.equal(s.intervalDays, 365);
	assert.ok(Number.isFinite(Date.parse(s.dueAt)));
});

test("nextDepth promotes every 2 consecutive successes up to target", () => {
	assert.equal(nextDepth(1, 3, "good", 1), 1);
	assert.equal(nextDepth(1, 3, "good", 2), 2);
	assert.equal(nextDepth(2, 3, "good", 3), 2);
	assert.equal(nextDepth(2, 3, "good", 4), 3);
	// never past target
	assert.equal(nextDepth(3, 3, "good", 6), 3);
	assert.equal(nextDepth(2, 2, "easy", 4), 2);
});

test("nextDepth demotes on a lapse but never below 1", () => {
	assert.equal(nextDepth(3, 3, "again", 0), 2);
	assert.equal(nextDepth(1, 3, "again", 0), 1);
});

test("hard neither promotes nor demotes", () => {
	assert.equal(nextDepth(2, 3, "hard", 4), 2);
});
