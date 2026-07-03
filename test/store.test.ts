import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { JsonStore } from "../src/storage/json.js";
import type { QuizQuestion } from "../src/types.js";

function makeTempStore(): JsonStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quizme-test-"));
  const store = new JsonStore(path.join(dir, "quizme.json"));
  store.init();
  return store;
}

const sampleQuestion: QuizQuestion = {
  id: "q1",
  sourceMode: "contextual",
  topic: "react",
  difficulty: 2,
  question: "Which hook memoizes a callback?",
  choices: [
    { id: "A", text: "useEffect" },
    { id: "B", text: "useCallback" },
    { id: "C", text: "useMemo" },
    { id: "D", text: "useRef" }
  ],
  answer: "B",
  explanation: "useCallback returns a memoized callback.",
  whyWrong: { A: "useEffect runs side effects.", C: "useMemo memoizes a value.", D: "useRef holds a ref." },
  tags: ["react", "hooks"],
  followUps: ["reconciliation"]
};

test("config round-trips through JSON", () => {
  const store = makeTempStore();
  assert.equal(store.getConfig("missing"), null);
  assert.equal(store.getConfig("missing", "fallback"), "fallback");
  store.setConfig("user", { level: "mid", language: "en" });
  assert.deepEqual(store.getConfig("user"), { level: "mid", language: "en" });
  store.setConfig("user", { level: "senior" });
  assert.deepEqual(store.getConfig("user"), { level: "senior" });
});

test("config persists across store instances", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quizme-test-"));
  const path1 = path.join(dir, "quizme.json");
  const store = new JsonStore(path1);
  store.init();
  store.setConfig("user", { level: "mid", language: "en" });
  const reloaded = new JsonStore(path1);
  reloaded.init();
  assert.deepEqual(reloaded.getConfig("user"), { level: "mid", language: "en" });
});

test("question bank is in-memory and cleared on demand", () => {
  const store = makeTempStore();
  store.saveQuestion(sampleQuestion);
  const listed = store.listRecentQuestions(5);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, "q1");
  assert.equal(listed[0].topic, "react");

  // Re-opening the store should NOT carry the question bank (in-memory only).
  const filePath = (store as unknown as { filePath: string }).filePath;
  const reloaded = new JsonStore(filePath);
  reloaded.init();
  assert.equal(reloaded.listRecentQuestions(5).length, 0);

  store.clearQuestionBank();
  assert.equal(store.listRecentQuestions(5).length, 0);
});

test("updateSignal clamps and accumulates within [0.05, 0.95]", () => {
  const store = makeTempStore();
  // wrong → 0.5 - 0.1 = 0.4, confidence 0.28, trend down
  store.updateSignal("react", false);
  let signals = store.getProfileSignals();
  assert.equal(signals[0].score, 0.4);
  assert.equal(signals[0].confidence, 0.28);
  assert.equal(signals[0].trend, "down");
  assert.equal(signals[0].wrongCount, 1);
  // correct → 0.4 + 0.08 = 0.48, confidence 0.36, trend up
  store.updateSignal("react", true);
  signals = store.getProfileSignals();
  assert.ok(Math.abs(signals[0].score - 0.48) < 1e-9);
  assert.ok(Math.abs(signals[0].confidence - 0.36) < 1e-9);
  assert.equal(signals[0].trend, "up");
  assert.equal(signals[0].correctCount, 1);
  assert.equal(signals[0].wrongCount, 1);
});

test("updateSignal clamps to the 0.95 ceiling and 0.05 floor", () => {
  const store = makeTempStore();
  for (let i = 0; i < 100; i++) store.updateSignal("strong", true);
  const strong = store.getProfileSignals().find((s) => s.tag === "strong");
  assert.equal(strong?.score, 0.95);
  assert.equal(strong?.confidence, 0.98);
  for (let i = 0; i < 100; i++) store.updateSignal("weak", false);
  const weak = store.getProfileSignals().find((s) => s.tag === "weak");
  assert.equal(weak?.score, 0.05);
});

test("recordAttempt updates aggregate stats and per-day buckets", () => {
  const store = makeTempStore();
  store.recordAttempt({
    questionId: "q1",
    selected: "A",
    correct: false,
    durationMs: 1500,
    tags: ["react", "hooks"]
  });
  store.updateSignal("react", false);
  store.upsertReviewItem(sampleQuestion, false);

  const stats = store.getStats();
  assert.equal(stats.attemptsTotal, 1);
  assert.equal(stats.attemptsCorrect, 0);
  assert.equal(stats.todayCount, 1);
  assert.equal(stats.reviewPending, 1);
  assert.equal(stats.whyCount, 0);
  assert.equal(stats.accuracy, 0);
  assert.equal(stats.xp, 4); // 0*10 + 1*4 + 0*3
  assert.equal(stats.level, 1);
  assert.ok(stats.currentStreak >= 1);
  assert.ok(stats.weekRows.length >= 1);
});

test("stats persist across store instances", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quizme-test-"));
  const filePath = path.join(dir, "quizme.json");
  const store = new JsonStore(filePath);
  store.init();
  store.recordAttempt({
    questionId: "q1",
    selected: "B",
    correct: true,
    durationMs: 800,
    tags: ["react"]
  });

  const reloaded = new JsonStore(filePath);
  reloaded.init();
  const stats = reloaded.getStats();
  assert.equal(stats.attemptsTotal, 1);
  assert.equal(stats.attemptsCorrect, 1);
  assert.equal(stats.todayCount, 1);
});

test("review queue tracks resolved state", () => {
  const store = makeTempStore();
  store.upsertReviewItem(sampleQuestion, false);
  assert.equal(store.listReviewQuestions().length, 1);
  assert.equal(store.listReviewQuestions()[0].id, "q1");
  store.upsertReviewItem(sampleQuestion, true);
  assert.equal(store.listReviewQuestions().length, 0);
});

test("recordWhyAttempt increments whyCount", () => {
  const store = makeTempStore();
  store.recordWhyAttempt("q1");
  store.recordWhyAttempt("q2");
  assert.equal(store.getStats().whyCount, 2);
});

test("a corrupt store file falls back to empty data", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quizme-test-"));
  const filePath = path.join(dir, "quizme.json");
  fs.writeFileSync(filePath, "{ not valid json", "utf8");
  const store = new JsonStore(filePath);
  store.init();
  assert.equal(store.getStats().attemptsTotal, 0);
  assert.equal(store.getProfileSignals().length, 0);
  store.setConfig("user", { level: "mid" });
  assert.deepEqual(store.getConfig("user"), { level: "mid" });
});
