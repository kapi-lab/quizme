import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { SqliteStore } from "../src/storage/sqlite.js";
import type { QuizQuestion } from "../src/types.js";

function makeTempStore(): SqliteStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quizme-test-"));
  const store = new SqliteStore(path.join(dir, "history.sqlite"));
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

test("questions are saved and listed by recency", () => {
  const store = makeTempStore();
  store.saveQuestion(sampleQuestion, "claude_session");
  const listed = store.listRecentQuestions(5);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, "q1");
  assert.equal(listed[0].topic, "react");
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

test("stats aggregates attempts, review queue, and signals", () => {
  const store = makeTempStore();
  store.saveQuestion(sampleQuestion, "claude_session");
  store.recordAttempt({
    questionId: "q1",
    selected: "A",
    correct: false,
    durationMs: 1500,
    tags: ["react", "hooks"]
  });
  store.updateSignal("react", false);
  store.upsertReviewItem("q1", false);

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

test("review queue tracks resolved state", () => {
  const store = makeTempStore();
  store.upsertReviewItem("q1", false);
  assert.deepEqual(store.listReviewQuestionIds(), ["q1"]);
  store.upsertReviewItem("q1", true);
  assert.deepEqual(store.listReviewQuestionIds(), []);
});

test("profile preferences upsert and delete", () => {
  const store = makeTempStore();
  store.upsertProfilePreference({ tag: "react", kind: "boost" });
  store.upsertProfilePreference({ tag: "css", kind: "suppress", note: "boring" });
  let prefs = store.listProfilePreferences();
  assert.equal(prefs.length, 2);
  // re-upsert updates kind without duplicating
  store.upsertProfilePreference({ tag: "react", kind: "known" });
  prefs = store.listProfilePreferences();
  assert.equal(prefs.length, 2);
  assert.equal(prefs.find((p) => p.tag === "react")?.kind, "known");
  store.deleteProfilePreference("css");
  prefs = store.listProfilePreferences();
  assert.equal(prefs.length, 1);
  assert.equal(prefs[0].tag, "react");
});

test("clearAll wipes every table", () => {
  const store = makeTempStore();
  store.saveQuestion(sampleQuestion, "claude_session");
  store.recordAttempt({ questionId: "q1", selected: "A", correct: false, durationMs: 100, tags: ["react"] });
  store.updateSignal("react", false);
  store.upsertProfilePreference({ tag: "react", kind: "boost" });
  store.upsertReviewItem("q1", false);
  store.appendWhyThread("q1", [{ asked: "why?", answer: "because", at: "2026-01-01" }]);
  store.clearAll();
  assert.equal(store.listRecentQuestions().length, 0);
  assert.equal(store.getProfileSignals().length, 0);
  assert.equal(store.listProfilePreferences().length, 0);
  assert.equal(store.listReviewQuestionIds().length, 0);
  const stats = store.getStats();
  assert.equal(stats.attemptsTotal, 0);
  assert.equal(stats.whyCount, 0);
});
