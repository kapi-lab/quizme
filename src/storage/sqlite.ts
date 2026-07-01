import { execFileSync } from "node:child_process";
import path from "node:path";
import { ensureDir } from "../platform/fs.js";
import type { ProfileSignal, QuizQuestion, Stats, WhyTurn } from "../types.js";

function shellQuote(value: unknown): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export class SqliteStore {
  dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    ensureDir(path.dirname(dbPath));
  }

  exec(sql: string) {
    return execFileSync("sqlite3", [this.dbPath, sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  }

  init(): void {
    this.exec(`
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        topic TEXT NOT NULL,
        difficulty INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id TEXT NOT NULL,
        selected TEXT NOT NULL,
        correct INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        tags_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profile_signals (
        tag TEXT PRIMARY KEY,
        score REAL NOT NULL,
        confidence REAL NOT NULL,
        trend TEXT NOT NULL,
        correct_count INTEGER NOT NULL,
        wrong_count INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS why_threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id TEXT NOT NULL,
        turns_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_items (
        question_id TEXT PRIMARY KEY,
        resolved INTEGER NOT NULL,
        last_result INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  setConfig(key: string, value: unknown): void {
    this.exec(`
      INSERT INTO config(key, value_json)
      VALUES (${shellQuote(key)}, ${shellQuote(JSON.stringify(value))})
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json;
    `);
  }

  getConfig<T>(key: string, fallback: T | null = null): T | null {
    const output = this.exec(`SELECT value_json FROM config WHERE key=${shellQuote(key)} LIMIT 1;`);
    return output ? (JSON.parse(output) as T) : fallback;
  }

  saveQuestion(question: QuizQuestion, sourceType: string): void {
    this.exec(`
      INSERT OR REPLACE INTO questions(id, source_type, topic, difficulty, payload_json, created_at)
      VALUES (
        ${shellQuote(question.id)},
        ${shellQuote(sourceType)},
        ${shellQuote(question.topic)},
        ${Number(question.difficulty || 1)},
        ${shellQuote(JSON.stringify(question))},
        datetime('now')
      );
    `);
  }

  listRecentQuestions(limit = 20): QuizQuestion[] {
    const output = this.exec(`
      SELECT payload_json FROM questions
      ORDER BY datetime(created_at) DESC
      LIMIT ${Number(limit)};
    `);
    return output ? output.split("\n").filter(Boolean).map((line) => JSON.parse(line) as QuizQuestion) : [];
  }

  recordAttempt({
    questionId,
    selected,
    correct,
    durationMs,
    tags
  }: {
    questionId: string;
    selected: string;
    correct: boolean;
    durationMs: number;
    tags: string[];
  }): void {
    this.exec(`
      INSERT INTO attempts(question_id, selected, correct, duration_ms, tags_json, created_at)
      VALUES (
        ${shellQuote(questionId)},
        ${shellQuote(selected)},
        ${correct ? 1 : 0},
        ${Number(durationMs)},
        ${shellQuote(JSON.stringify(tags || []))},
        datetime('now')
      );
    `);
  }

  updateSignal(tag: string, wasCorrect: boolean): void {
    const row = this.exec(`
      SELECT score, confidence, correct_count, wrong_count
      FROM profile_signals WHERE tag=${shellQuote(tag)} LIMIT 1;
    `);
    let score = 0.5;
    let confidence = 0.2;
    let correctCount = 0;
    let wrongCount = 0;
    if (row) {
      [score, confidence, correctCount, wrongCount] = row.split("|").map(Number);
    }

    correctCount += wasCorrect ? 1 : 0;
    wrongCount += wasCorrect ? 0 : 1;
    const delta = wasCorrect ? 0.08 : -0.1;
    const nextScore = Math.max(0.05, Math.min(0.95, score + delta));
    const nextConfidence = Math.min(0.98, confidence + 0.08);
    const trend = delta > 0 ? "up" : "down";
    this.exec(`
      INSERT INTO profile_signals(tag, score, confidence, trend, correct_count, wrong_count, updated_at)
      VALUES (
        ${shellQuote(tag)},
        ${nextScore},
        ${nextConfidence},
        ${shellQuote(trend)},
        ${correctCount},
        ${wrongCount},
        datetime('now')
      )
      ON CONFLICT(tag) DO UPDATE SET
        score=excluded.score,
        confidence=excluded.confidence,
        trend=excluded.trend,
        correct_count=excluded.correct_count,
        wrong_count=excluded.wrong_count,
        updated_at=excluded.updated_at;
    `);
  }

  getProfileSignals(): ProfileSignal[] {
    const output = this.exec(`
      SELECT tag, score, confidence, trend, correct_count, wrong_count
      FROM profile_signals
      ORDER BY score DESC, confidence DESC;
    `);
    return output
      ? output.split("\n").filter(Boolean).map((line) => {
          const [tag, score, confidence, trend, correctCount, wrongCount] = line.split("|");
          return {
            tag,
            score: Number(score),
            confidence: Number(confidence),
            trend,
            correctCount: Number(correctCount),
            wrongCount: Number(wrongCount)
          };
        })
      : [];
  }

  getStats(): Stats {
    const attemptsTotal = Number(this.exec("SELECT COUNT(*) FROM attempts;") || 0);
    const attemptsCorrect = Number(this.exec("SELECT COUNT(*) FROM attempts WHERE correct=1;") || 0);
    const todayCount = Number(this.exec("SELECT COUNT(*) FROM attempts WHERE date(created_at)=date('now','localtime');") || 0);
    const reviewPending = Number(this.exec("SELECT COUNT(*) FROM review_items WHERE resolved=0;") || 0);
    const whyCount = Number(this.exec("SELECT COUNT(*) FROM why_threads;") || 0);
    const distinctDays = this.exec(`
      SELECT DISTINCT date(created_at, 'localtime')
      FROM attempts
      ORDER BY date(created_at, 'localtime') DESC;
    `);
    const weekRows = this.exec(`
      SELECT date(created_at, 'localtime'), COUNT(*)
      FROM attempts
      WHERE datetime(created_at) >= datetime('now', '-6 day', 'localtime')
      GROUP BY 1
      ORDER BY 1;
    `);
    const longestStreak = this.exec(`
      WITH days AS (
        SELECT DISTINCT date(created_at, 'localtime') AS day
        FROM attempts
      ),
      streaks AS (
        SELECT
          day,
          julianday(day) - ROW_NUMBER() OVER (ORDER BY day) AS grp
        FROM days
      )
      SELECT COALESCE(MAX(cnt), 0)
      FROM (
        SELECT COUNT(*) AS cnt
        FROM streaks
        GROUP BY grp
      );
    `);

    const dayList = distinctDays ? distinctDays.split("\n").filter(Boolean) : [];
    let currentStreak = 0;
    let cursor = new Date();
    for (const day of dayList) {
      const expected = cursor.toISOString().slice(0, 10);
      if (day !== expected) {
        if (currentStreak === 0) {
          cursor.setDate(cursor.getDate() - 1);
          const yesterday = cursor.toISOString().slice(0, 10);
          if (day !== yesterday) {
            break;
          }
        } else {
          break;
        }
      }
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const xp = attemptsCorrect * 10 + (attemptsTotal - attemptsCorrect) * 4 + whyCount * 3;
    const level = Math.floor(xp / 100) + 1;
    return {
      attemptsTotal,
      attemptsCorrect,
      todayCount,
      reviewPending,
      whyCount,
      currentStreak,
      longestStreak: Number(longestStreak || 0),
      xp,
      level,
      accuracy: attemptsTotal ? attemptsCorrect / attemptsTotal : 0,
      weekRows: weekRows
        ? weekRows.split("\n").filter(Boolean).map((line) => line.split("|") as [string, string])
        : []
    };
  }

  upsertReviewItem(questionId: string, resolved: boolean): void {
    this.exec(`
      INSERT INTO review_items(question_id, resolved, last_result, updated_at)
      VALUES (${shellQuote(questionId)}, ${resolved ? 1 : 0}, ${resolved ? 1 : 0}, datetime('now'))
      ON CONFLICT(question_id) DO UPDATE SET
        resolved=excluded.resolved,
        last_result=excluded.last_result,
        updated_at=excluded.updated_at;
    `);
  }

  listReviewQuestionIds(limit = 5): string[] {
    const output = this.exec(`
      SELECT question_id FROM review_items
      WHERE resolved=0
      ORDER BY datetime(updated_at) DESC
      LIMIT ${Number(limit)};
    `);
    return output ? output.split("\n").filter(Boolean) : [];
  }

  appendWhyThread(questionId: string, turns: WhyTurn[]): void {
    this.exec(`
      INSERT INTO why_threads(question_id, turns_json, updated_at)
      VALUES (${shellQuote(questionId)}, ${shellQuote(JSON.stringify(turns))}, datetime('now'));
    `);
  }

  clearAll(): void {
    this.exec(`
      DELETE FROM attempts;
      DELETE FROM questions;
      DELETE FROM profile_signals;
      DELETE FROM why_threads;
      DELETE FROM review_items;
    `);
  }

  clearWhyThreads(): void {
    this.exec("DELETE FROM why_threads;");
  }
}
