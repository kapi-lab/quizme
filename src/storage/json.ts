import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { initialSrs, nextDepth, rateSrs } from "../srs.js";
import type {
  KnowledgePoint,
  KpAnchor,
  KpCandidate,
  KpDepth,
  ProfileSignal,
  QuizQuestion,
  Rating,
  Stats,
  Store
} from "../types.js";

/**
 * JSON-backed store. A single `quizme.json` file holds config, aggregate
 * stats, profile signals, the pending review queue, and the knowledge-point
 * ledger (the persistent learning units with their SRS state). The current
 * round's card bank lives in memory only — cleared on each new round, never
 * persisted. Writes go through a temp file + rename so a crash mid-write
 * cannot corrupt the store.
 */

interface DayBucket {
  total: number;
  correct: number;
}

interface SignalRow {
  score: number;
  confidence: number;
  trend: string;
  correctCount: number;
  wrongCount: number;
}

interface ReviewEntry {
  id: string;
  question: QuizQuestion;
  addedAt: string;
}

interface StoreData {
  version: number;
  config: Record<string, unknown>;
  stats: {
    totalAttempts: number;
    correctAttempts: number;
    whyCount: number;
    byDay: Record<string, DayBucket>;
  };
  profile: {
    signals: Record<string, SignalRow>;
  };
  reviewQueue: ReviewEntry[];
  knowledgePoints: Record<string, KnowledgePoint>;
}

function emptyData(): StoreData {
  return {
    version: 1,
    config: {},
    stats: { totalAttempts: 0, correctAttempts: 0, whyCount: 0, byDay: {} },
    profile: { signals: {} },
    reviewQueue: [],
    knowledgePoints: {}
  };
}

/** Canonicalize a KP name so extraction-stage variants dedupe to one entry. */
function normalizeKpName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

function clampDepth(value: unknown): KpDepth {
  const n = Number(value);
  if (n >= 3) return 3;
  if (n >= 2) return 2;
  return 1;
}

const KP_PROVENANCE_CAP = 10;
const KP_RECENT_ASKS_CAP = 8;

function localStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDay(s: string): Date | null {
  const parts = s.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}

function computeCurrentStreak(byDay: Record<string, DayBucket>): number {
  const cursor = new Date();
  if (!byDay[localStr(cursor)]) {
    cursor.setDate(cursor.getDate() - 1);
    if (!byDay[localStr(cursor)]) return 0;
  }
  let streak = 0;
  while (byDay[localStr(cursor)]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function computeLongestStreak(byDay: Record<string, DayBucket>): number {
  const days = Object.keys(byDay).sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const day of days) {
    const d = parseDay(day);
    if (!d) continue;
    if (prev && Math.round((d.getTime() - prev.getTime()) / 86_400_000) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = d;
  }
  return longest;
}

function computeWeekRows(byDay: Record<string, DayBucket>): [string, string][] {
  const rows: [string, string][] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = localStr(d);
    const bucket = byDay[key];
    if (bucket) rows.push([key, String(bucket.total)]);
  }
  return rows;
}

export class JsonStore implements Store {
  private filePath: string;
  private data: StoreData;
  private questionBank: QuizQuestion[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
    this.data = this.load();
  }

  private load(): StoreData {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      if (!raw.trim()) return emptyData();
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      const stats = parsed.stats ?? ({} as StoreData["stats"]);
      return {
        version: 1,
        config: parsed.config ?? {},
        stats: {
          totalAttempts: stats.totalAttempts ?? 0,
          correctAttempts: stats.correctAttempts ?? 0,
          whyCount: stats.whyCount ?? 0,
          byDay: stats.byDay ?? {}
        },
        profile: { signals: parsed.profile?.signals ?? {} },
        reviewQueue: Array.isArray(parsed.reviewQueue) ? parsed.reviewQueue : [],
        knowledgePoints:
          parsed.knowledgePoints && typeof parsed.knowledgePoints === "object"
            ? parsed.knowledgePoints
            : {}
      };
    } catch {
      return emptyData();
    }
  }

  private persist(): void {
    const dir = path.dirname(this.filePath);
    if (dir) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  init(): void {
    // Data is loaded in the constructor; nothing to initialize eagerly.
  }

  setConfig(key: string, value: unknown): void {
    this.data.config[key] = value;
    this.persist();
  }

  getConfig<T>(key: string, fallback: T | null = null): T | null {
    const value = this.data.config[key];
    return value === undefined ? fallback : (value as T);
  }

  saveQuestion(question: QuizQuestion): void {
    const idx = this.questionBank.findIndex((q) => q.id === question.id);
    if (idx >= 0) this.questionBank[idx] = question;
    else this.questionBank.push(question);
  }

  listRecentQuestions(limit = 20): QuizQuestion[] {
    return [...this.questionBank].reverse().slice(0, limit);
  }

  clearQuestionBank(): void {
    this.questionBank = [];
  }

  resetAll(): void {
    this.data = emptyData();
    this.questionBank = [];
    this.persist();
  }

  recordAttempt({
    correct
  }: {
    questionId: string;
    selected: string;
    correct: boolean;
    durationMs: number;
    tags: string[];
  }): void {
    this.data.stats.totalAttempts += 1;
    if (correct) this.data.stats.correctAttempts += 1;
    const today = localStr(new Date());
    const bucket = this.data.stats.byDay[today] ?? { total: 0, correct: 0 };
    bucket.total += 1;
    if (correct) bucket.correct += 1;
    this.data.stats.byDay[today] = bucket;
    this.persist();
  }

  recordWhyAttempt(_questionId: string): void {
    this.data.stats.whyCount += 1;
    this.persist();
  }

  updateSignal(tag: string, wasCorrect: boolean): void {
    const delta = wasCorrect ? 0.08 : -0.1;
    const trend = delta > 0 ? "up" : "down";
    const prev = this.data.profile.signals[tag] ?? {
      score: 0.5,
      confidence: 0.2,
      trend,
      correctCount: 0,
      wrongCount: 0
    };
    this.data.profile.signals[tag] = {
      score: Math.min(0.95, Math.max(0.05, prev.score + delta)),
      confidence: Math.min(0.98, prev.confidence + 0.08),
      trend,
      correctCount: prev.correctCount + (wasCorrect ? 1 : 0),
      wrongCount: prev.wrongCount + (wasCorrect ? 0 : 1)
    };
    this.persist();
  }

  getProfileSignals(): ProfileSignal[] {
    return Object.entries(this.data.profile.signals)
      .map(([tag, row]) => ({ tag, ...row }))
      .sort((a, b) => b.score - a.score || b.confidence - a.confidence);
  }

  upsertReviewItem(question: QuizQuestion, resolved: boolean): void {
    const idx = this.data.reviewQueue.findIndex((r) => r.id === question.id);
    if (resolved) {
      if (idx >= 0) this.data.reviewQueue.splice(idx, 1);
      this.persist();
      return;
    }
    const entry: ReviewEntry = {
      id: question.id,
      question,
      addedAt: new Date().toISOString()
    };
    if (idx >= 0) this.data.reviewQueue[idx] = entry;
    else this.data.reviewQueue.push(entry);
    this.persist();
  }

  listReviewQuestions(limit = 5): QuizQuestion[] {
    return [...this.data.reviewQueue]
      .reverse()
      .slice(0, limit)
      .map((r) => r.question);
  }

  upsertKnowledgePoint(candidate: KpCandidate, anchor: KpAnchor): KnowledgePoint {
    const name = normalizeKpName(candidate.name);
    const existing = Object.values(this.data.knowledgePoints).find(
      (kp) => kp.name === name
    );
    if (existing) {
      existing.provenance = [...existing.provenance, anchor].slice(-KP_PROVENANCE_CAP);
      if (!existing.essence.trim() && candidate.essence.trim()) {
        existing.essence = candidate.essence.trim();
      }
      this.persist();
      return existing;
    }

    const targetDepth = clampDepth(candidate.suggestedDepth);
    const kp: KnowledgePoint = {
      id: `kp_${crypto.createHash("sha1").update(name).digest("hex").slice(0, 10)}`,
      name,
      essence: candidate.essence.trim(),
      domain: candidate.domain.map((d) => d.trim()).filter(Boolean),
      targetDepth,
      // First exposure tests working knowledge at most; D3 is earned through reviews.
      currentDepth: Math.min(2, targetDepth) as KpDepth,
      srs: initialSrs(),
      provenance: [anchor],
      recentAsks: [],
      createdAt: new Date().toISOString()
    };
    this.data.knowledgePoints[kp.id] = kp;
    this.persist();
    return kp;
  }

  getKnowledgePoint(id: string): KnowledgePoint | null {
    return this.data.knowledgePoints[id] ?? null;
  }

  listKnowledgePoints(): KnowledgePoint[] {
    return Object.values(this.data.knowledgePoints);
  }

  listDueKnowledgePoints(now: Date = new Date()): KnowledgePoint[] {
    const cutoff = now.getTime();
    return Object.values(this.data.knowledgePoints)
      .filter(
        (kp) => kp.srs.lastRating !== null && Date.parse(kp.srs.dueAt) <= cutoff
      )
      .sort((a, b) => Date.parse(a.srs.dueAt) - Date.parse(b.srs.dueAt));
  }

  rateKnowledgePoint(
    id: string,
    rating: Rating,
    askedQuestion: string,
    now: Date = new Date()
  ): KnowledgePoint | null {
    const kp = this.data.knowledgePoints[id];
    if (!kp) return null;
    kp.srs = rateSrs(kp.srs, rating, now);
    kp.currentDepth = nextDepth(kp.currentDepth, kp.targetDepth, rating, kp.srs.reps);
    kp.recentAsks = [
      ...kp.recentAsks,
      { question: askedQuestion, at: now.toISOString() }
    ].slice(-KP_RECENT_ASKS_CAP);
    this.persist();
    return kp;
  }

  getStats(): Stats {
    const { totalAttempts, correctAttempts, whyCount, byDay } = this.data.stats;
    const reviewPending = this.data.reviewQueue.length;
    const today = localStr(new Date());
    const todayCount = byDay[today]?.total ?? 0;
    return {
      attemptsTotal: totalAttempts,
      attemptsCorrect: correctAttempts,
      todayCount,
      reviewPending,
      whyCount,
      currentStreak: computeCurrentStreak(byDay),
      longestStreak: computeLongestStreak(byDay),
      xp: correctAttempts * 10 + (totalAttempts - correctAttempts) * 4 + whyCount * 3,
      level: Math.floor(
        (correctAttempts * 10 + (totalAttempts - correctAttempts) * 4 + whyCount * 3) / 100
      ) + 1,
      accuracy: totalAttempts ? correctAttempts / totalAttempts : 0,
      weekRows: computeWeekRows(byDay)
    };
  }
}
