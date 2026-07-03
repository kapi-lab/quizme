import Database from "better-sqlite3";
import path from "node:path";
import { ensureDir } from "../platform/fs.js";
import type {
  ProfilePreference,
  ProfilePreferenceKind,
  ProfileSignal,
  QuizQuestion,
  Stats,
  WhyTurn
} from "../types.js";

/**
 * SQLite-backed store. Uses `better-sqlite3` (synchronous, in-process) instead
 * of shelling out to the `sqlite3` CLI — eliminates a subprocess spawn per
 * query and removes the external binary dependency.
 */
export class SqliteStore {
  dbPath: string;
  private db: Database.Database;
  private stmtCache = new Map<string, Database.Statement>();

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    ensureDir(path.dirname(dbPath));
    this.db = new Database(dbPath);
    this.db.pragma("busy_timeout = 5000");
  }

  private stmt(sql: string): Database.Statement {
    let prepared = this.stmtCache.get(sql);
    if (!prepared) {
      prepared = this.db.prepare(sql);
      this.stmtCache.set(sql, prepared);
    }
    return prepared;
  }

  init(): void {
    this.db.exec(`
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
      CREATE TABLE IF NOT EXISTS profile_preferences (
        tag TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        note TEXT NOT NULL,
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
    this.stmt(
      `INSERT INTO config(key, value_json)
       VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json;`
    ).run({ key, value: JSON.stringify(value) });
  }

  getConfig<T>(key: string, fallback: T | null = null): T | null {
    const row = this.stmt(`SELECT value_json FROM config WHERE key=@key LIMIT 1;`).get({ key }) as
      | { value_json: string }
      | undefined;
    return row ? (JSON.parse(row.value_json) as T) : fallback;
  }

  saveQuestion(question: QuizQuestion, sourceType: string): void {
    this.stmt(
      `INSERT OR REPLACE INTO questions(id, source_type, topic, difficulty, payload_json, created_at)
       VALUES (@id, @sourceType, @topic, @difficulty, @payload, datetime('now'));`
    ).run({
      id: question.id,
      sourceType,
      topic: question.topic,
      difficulty: Number(question.difficulty || 1),
      payload: JSON.stringify(question)
    });
  }

  listRecentQuestions(limit = 20): QuizQuestion[] {
    const rows = this.stmt(
      `SELECT payload_json FROM questions
       ORDER BY datetime(created_at) DESC
       LIMIT @limit;`
    ).all({ limit: Number(limit) }) as Array<{ payload_json: string }>;
    return rows.map((row) => JSON.parse(row.payload_json) as QuizQuestion);
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
    this.stmt(
      `INSERT INTO attempts(question_id, selected, correct, duration_ms, tags_json, created_at)
       VALUES (@questionId, @selected, @correct, @durationMs, @tags, datetime('now'));`
    ).run({
      questionId,
      selected,
      correct: correct ? 1 : 0,
      durationMs: Number(durationMs),
      tags: JSON.stringify(tags || [])
    });
  }

  updateSignal(tag: string, wasCorrect: boolean): void {
    const delta = wasCorrect ? 0.08 : -0.1;
    const trend = delta > 0 ? "up" : "down";
    // Single atomic UPSERT: read current values via subquery, clamp, write back.
    this.stmt(
      `INSERT INTO profile_signals(tag, score, confidence, trend, correct_count, wrong_count, updated_at)
       VALUES (
         @tag,
         MIN(0.95, MAX(0.05, COALESCE((SELECT score FROM profile_signals WHERE tag=@tag), 0.5) + @delta)),
         MIN(0.98, COALESCE((SELECT confidence FROM profile_signals WHERE tag=@tag), 0.2) + 0.08),
         @trend,
         COALESCE((SELECT correct_count FROM profile_signals WHERE tag=@tag), 0) + @correctInc,
         COALESCE((SELECT wrong_count FROM profile_signals WHERE tag=@tag), 0) + @wrongInc,
         datetime('now')
       )
       ON CONFLICT(tag) DO UPDATE SET
         score=excluded.score,
         confidence=excluded.confidence,
         trend=excluded.trend,
         correct_count=excluded.correct_count,
         wrong_count=excluded.wrong_count,
         updated_at=excluded.updated_at;`
    ).run({
      tag,
      delta,
      trend,
      correctInc: wasCorrect ? 1 : 0,
      wrongInc: wasCorrect ? 0 : 1
    });
  }

  getProfileSignals(): ProfileSignal[] {
    const rows = this.stmt(
      `SELECT tag, score, confidence, trend, correct_count, wrong_count
       FROM profile_signals
       ORDER BY score DESC, confidence DESC;`
    ).all() as Array<{
      tag: string;
      score: number;
      confidence: number;
      trend: string;
      correct_count: number;
      wrong_count: number;
    }>;
    return rows.map((row) => ({
      tag: row.tag,
      score: row.score,
      confidence: row.confidence,
      trend: row.trend,
      correctCount: row.correct_count,
      wrongCount: row.wrong_count
    }));
  }

  getStats(): Stats {
    const counts = this.stmt(
      `SELECT
         (SELECT COUNT(*) FROM attempts) AS total,
         (SELECT COUNT(*) FROM attempts WHERE correct=1) AS correct,
         (SELECT COUNT(*) FROM attempts WHERE date(created_at)=date('now','localtime')) AS today,
         (SELECT COUNT(*) FROM review_items WHERE resolved=0) AS reviewPending,
         (SELECT COUNT(*) FROM why_threads) AS whyCount;`
    ).get() as {
      total: number;
      correct: number;
      today: number;
      reviewPending: number;
      whyCount: number;
    };

    const dayList = (
      this.stmt(
        `SELECT DISTINCT date(created_at, 'localtime') AS day
         FROM attempts
         ORDER BY day DESC;`
      ).all() as Array<{ day: string }>
    ).map((row) => row.day);

    const weekRows = (
      this.stmt(
        `SELECT date(created_at, 'localtime') AS day, COUNT(*) AS count
         FROM attempts
         WHERE datetime(created_at) >= datetime('now', '-6 day', 'localtime')
         GROUP BY day
         ORDER BY day;`
      ).all() as Array<{ day: string; count: number }>
    ).map((row) => [row.day, String(row.count)] as [string, string]);

    const longest = this.stmt(
      `WITH days AS (
         SELECT DISTINCT date(created_at, 'localtime') AS day FROM attempts
       ),
       streaks AS (
         SELECT
           day,
           julianday(day) - ROW_NUMBER() OVER (ORDER BY day) AS grp
         FROM days
       )
       SELECT COALESCE(MAX(cnt), 0) AS cnt
       FROM (SELECT COUNT(*) AS cnt FROM streaks GROUP BY grp);`
    ).get() as { cnt: number };

    const attemptsTotal = Number(counts?.total ?? 0);
    const attemptsCorrect = Number(counts?.correct ?? 0);
    const todayCount = Number(counts?.today ?? 0);
    const reviewPending = Number(counts?.reviewPending ?? 0);
    const whyCount = Number(counts?.whyCount ?? 0);

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
      longestStreak: Number(longest?.cnt ?? 0),
      xp,
      level,
      accuracy: attemptsTotal ? attemptsCorrect / attemptsTotal : 0,
      weekRows
    };
  }

  upsertReviewItem(questionId: string, resolved: boolean): void {
    this.stmt(
      `INSERT INTO review_items(question_id, resolved, last_result, updated_at)
       VALUES (@questionId, @resolved, @lastResult, datetime('now'))
       ON CONFLICT(question_id) DO UPDATE SET
         resolved=excluded.resolved,
         last_result=excluded.last_result,
         updated_at=excluded.updated_at;`
    ).run({ questionId, resolved: resolved ? 1 : 0, lastResult: resolved ? 1 : 0 });
  }

  listReviewQuestionIds(limit = 5): string[] {
    const rows = this.stmt(
      `SELECT question_id FROM review_items
       WHERE resolved=0
       ORDER BY datetime(updated_at) DESC
       LIMIT @limit;`
    ).all({ limit: Number(limit) }) as Array<{ question_id: string }>;
    return rows.map((row) => row.question_id);
  }

  appendWhyThread(questionId: string, turns: WhyTurn[]): void {
    this.stmt(
      `INSERT INTO why_threads(question_id, turns_json, updated_at)
       VALUES (@questionId, @turns, datetime('now'));`
    ).run({ questionId, turns: JSON.stringify(turns) });
  }

  listProfilePreferences(): ProfilePreference[] {
    const rows = this.stmt(
      `SELECT tag, kind, note, updated_at
       FROM profile_preferences
       ORDER BY datetime(updated_at) DESC;`
    ).all() as Array<{ tag: string; kind: string; note: string; updated_at: string }>;
    return rows.map((row) => ({
      tag: row.tag,
      kind: row.kind as ProfilePreferenceKind,
      note: row.note || undefined,
      updatedAt: row.updated_at
    }));
  }

  upsertProfilePreference(pref: { tag: string; kind: ProfilePreferenceKind; note?: string }): void {
    this.stmt(
      `INSERT INTO profile_preferences(tag, kind, note, updated_at)
       VALUES (@tag, @kind, @note, datetime('now'))
       ON CONFLICT(tag) DO UPDATE SET
         kind=excluded.kind,
         note=excluded.note,
         updated_at=excluded.updated_at;`
    ).run({ tag: pref.tag, kind: pref.kind, note: pref.note ?? "" });
  }

  deleteProfilePreference(tag: string): void {
    this.stmt(`DELETE FROM profile_preferences WHERE tag=@tag;`).run({ tag });
  }

  clearProfilePreferences(): void {
    this.db.exec("DELETE FROM profile_preferences;");
  }

  clearAttemptHistory(): void {
    this.db.exec(`
      DELETE FROM attempts;
      DELETE FROM review_items;
    `);
  }

  clearProfileSignals(): void {
    this.db.exec("DELETE FROM profile_signals;");
  }

  clearQuestionBank(): void {
    this.db.exec("DELETE FROM questions;");
  }

  clearAll(): void {
    this.db.exec(`
      DELETE FROM attempts;
      DELETE FROM questions;
      DELETE FROM profile_signals;
      DELETE FROM profile_preferences;
      DELETE FROM why_threads;
      DELETE FROM review_items;
    `);
  }

  clearWhyThreads(): void {
    this.db.exec("DELETE FROM why_threads;");
  }

  close(): void {
    this.db.close();
  }
}
