import test from "node:test";
import assert from "node:assert/strict";
import { interleavePlan, pickRound, planItem } from "../src/generation/compose.js";
import { initialSrs } from "../src/srs.js";
import type { KnowledgePoint, KpCandidate, KpDepth } from "../src/types.js";

function kp(id: string, currentDepth: KpDepth = 1): KnowledgePoint {
	return {
		id,
		name: id,
		essence: `essence of ${id}`,
		domain: ["testing"],
		targetDepth: 3,
		currentDepth,
		srs: initialSrs(new Date("2026-07-16T12:00:00Z")),
		provenance: [],
		recentAsks: [],
		createdAt: "2026-07-16T12:00:00Z"
	};
}

function candidate(name: string, relevance: number): KpCandidate {
	return {
		name,
		essence: `essence of ${name}`,
		domain: ["testing"],
		suggestedDepth: 2,
		relevance,
		anchor: "anchor"
	};
}

test("pickRound caps reviews at half the round and ranks candidates by relevance", () => {
	const picked = pickRound({
		dueKps: [kp("r1"), kp("r2"), kp("r3"), kp("r4"), kp("r5")],
		candidates: [candidate("a", 0.2), candidate("b", 0.9), candidate("c", 0.5)],
		total: 5
	});
	assert.equal(picked.reviews.length, 3); // ceil(5/2)
	assert.deepEqual(
		picked.candidates.map((c) => c.name),
		["b", "c"] // top relevance first, only 2 slots left
	);
});

test("pickRound backfills with extra reviews when candidates run short", () => {
	const picked = pickRound({
		dueKps: [kp("r1"), kp("r2"), kp("r3"), kp("r4"), kp("r5")],
		candidates: [candidate("a", 0.5)],
		total: 5
	});
	assert.equal(picked.reviews.length, 4);
	assert.equal(picked.candidates.length, 1);
});

test("pickRound backfills with extra candidates when reviews run short", () => {
	const picked = pickRound({
		dueKps: [kp("r1")],
		candidates: [candidate("a", 0.9), candidate("b", 0.8), candidate("c", 0.7), candidate("d", 0.6), candidate("e", 0.5)],
		total: 5
	});
	assert.equal(picked.reviews.length, 1);
	assert.equal(picked.candidates.length, 4);
});

test("pickRound handles no reviews and no candidates gracefully", () => {
	const onlyNew = pickRound({ dueKps: [], candidates: [candidate("a", 0.5)], total: 5 });
	assert.equal(onlyNew.reviews.length, 0);
	assert.equal(onlyNew.candidates.length, 1);

	const onlyDue = pickRound({ dueKps: [kp("r1"), kp("r2")], candidates: [], total: 5 });
	assert.equal(onlyDue.reviews.length, 2);
	assert.equal(onlyDue.candidates.length, 0);
});

test("interleavePlan starts fresh and alternates with reviews", () => {
	const plan = interleavePlan({
		reviews: [planItem(kp("r1"), "review"), planItem(kp("r2"), "review")],
		fresh: [planItem(kp("n1"), "new"), planItem(kp("n2"), "new"), planItem(kp("n3"), "new")]
	});
	assert.deepEqual(
		plan.map((p) => p.kp.id),
		["n1", "r1", "n2", "r2", "n3"]
	);
	assert.deepEqual(
		plan.map((p) => p.origin),
		["new", "review", "new", "review", "new"]
	);
});

test("planItem carries the KP's current depth onto the card plan", () => {
	const item = planItem(kp("r1", 2), "review");
	assert.equal(item.depth, 2);
});
