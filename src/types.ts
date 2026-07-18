export type Language = "zh-CN" | "en";
export type Level = "junior" | "mid" | "senior" | "staff";
export type QuizMode = "mixed" | "review";

/** Effort levels accepted by the `claude` CLI `--effort` flag. */
export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type SourceType = "manual" | "topic" | "repo" | "claude_session";
export type QuestionSourceMode = "contextual" | "adjacent" | "interview_style";

/** Spaced-repetition rating for a knowledge point after one card is answered. */
export type Rating = "again" | "hard" | "good" | "easy";
/** Where a card came from in the round plan: new concept, due review, or weak-area reinforcement. */
export type CardOrigin = "new" | "review" | "reinforce";
/** Knowledge depth: 1 awareness, 2 working knowledge, 3 deep understanding. */
export type KpDepth = 1 | 2 | 3;

export interface SrsState {
  /** Consecutive successful reviews since the last lapse. */
  reps: number;
  /** Total times the KP was forgotten (rated "again"). */
  lapses: number;
  /** SM-2 ease factor, clamped to [1.3, 3.0]. */
  ease: number;
  /** Current review interval in days. */
  intervalDays: number;
  /** ISO timestamp when this KP is next due for review. */
  dueAt: string;
  /** null until the KP has been asked at least once. */
  lastRating: Rating | null;
}

export interface KpAnchor {
  sourceType: SourceType;
  title: string;
  at: string;
}

export interface KpAsk {
  question: string;
  at: string;
}

/**
 * The persistent learning unit. Cards are ephemeral renderings of a KP;
 * the forgetting curve, depth progression, and history all live here.
 */
export interface KnowledgePoint {
  id: string;
  /** Canonical kebab-case name, used for dedupe across extractions. */
  name: string;
  /** One-sentence transferable takeaway. */
  essence: string;
  domain: string[];
  targetDepth: KpDepth;
  currentDepth: KpDepth;
  srs: SrsState;
  /** Which sessions/repos/topics triggered this KP. */
  provenance: KpAnchor[];
  /** Recent question stems asked about this KP — passed to generation to force variation. */
  recentAsks: KpAsk[];
  createdAt: string;
}

/** A knowledge-point candidate produced by the extraction stage, before persistence. */
export interface KpCandidate {
  name: string;
  essence: string;
  domain: string[];
  suggestedDepth: KpDepth;
  /** 0..1 relevance to the user, used to rank candidates when composing a round. */
  relevance: number;
  /** The snippet of source context that triggered this KP. */
  anchor: string;
}

export interface SourceSummary {
  sourceType: SourceType;
  title: string;
  summary: string;
}

export interface Choice {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  sourceMode: QuestionSourceMode;
  topic: string;
  difficulty: number;
  question: string;
  choices: Choice[];
  answer: string;
  explanation: string;
  whyWrong: Record<string, string>;
  tags: string[];
  followUps: string[];
  /** Card fields (learning-card rounds). Absent on legacy/override questions. */
  kpId?: string;
  origin?: CardOrigin;
  depth?: KpDepth;
  /** 1–2 sentence scenario grounding the question in the user's context. */
  anchor?: string;
  /** One-sentence transferable takeaway shown on the card back. */
  takeaway?: string;
}

export interface UserConfig {
  level: Level;
  language: Language;
  dailyGoal: number;
  soundEnabled: boolean;
  createdAt: string;
  /**
   * Model alias passed to `claude --model` for quiz generation
   * (e.g. "haiku", "sonnet", "opus"). Empty/undefined = account default.
   */
  claudeModel?: string;
  /** Effort level passed to `claude --effort` for quiz generation. */
  claudeEffort?: ClaudeEffort;
}

export interface AnswerResult {
  selected: string;
  correct: boolean;
  /** True when the user chose "not sure, show me the answer" instead of guessing. */
  skipped?: boolean;
}

export interface WhyTurn {
  asked: string;
  answer: string;
  at: string;
}

export interface WhyMessage {
  asked: string;
  answer: string;
}

export interface ProfileSignal {
  tag: string;
  score: number;
  confidence: number;
  trend: string;
  correctCount: number;
  wrongCount: number;
}

export interface Stats {
  attemptsTotal: number;
  attemptsCorrect: number;
  todayCount: number;
  reviewPending: number;
  whyCount: number;
  currentStreak: number;
  longestStreak: number;
  xp: number;
  level: number;
  accuracy: number;
  weekRows: [string, string][];
}

export interface SoundPlayer {
  playNavigate: () => void;
  playSelect: () => void;
  playCorrect: () => void;
  playIncorrect: () => void;
  playStart: () => void;
  playComplete: () => void;
  playToggleOn: () => void;
  playToggleOff: () => void;
}

export interface Store {
  init(): void;
  setConfig(key: string, value: unknown): void;
  getConfig<T>(key: string, fallback?: T | null): T | null;
  saveQuestion(question: QuizQuestion): void;
  listRecentQuestions(limit?: number): QuizQuestion[];
  clearQuestionBank(): void;
  recordAttempt(payload: {
    questionId: string;
    selected: string;
    correct: boolean;
    durationMs: number;
    tags: string[];
  }): void;
  recordWhyAttempt(questionId: string): void;
  updateSignal(tag: string, wasCorrect: boolean): void;
  getProfileSignals(): ProfileSignal[];
  upsertReviewItem(question: QuizQuestion, resolved: boolean): void;
  listReviewQuestions(limit?: number): QuizQuestion[];
  /** Merge a candidate into the KP store by canonical name; returns the persisted KP. */
  upsertKnowledgePoint(candidate: KpCandidate, anchor: KpAnchor): KnowledgePoint;
  getKnowledgePoint(id: string): KnowledgePoint | null;
  listKnowledgePoints(): KnowledgePoint[];
  /** KPs due for review (asked before and dueAt <= now), most overdue first. */
  listDueKnowledgePoints(now?: Date): KnowledgePoint[];
  /** Apply an SRS rating + depth progression after a card is answered; returns the updated KP. */
  rateKnowledgePoint(id: string, rating: Rating, askedQuestion: string, now?: Date): KnowledgePoint | null;
  getStats(): Stats;
  /**
   * Wipe all persisted state — config, stats, profile signals, the review
   * queue — plus the in-memory question bank for the current round. Used by
   * the "clear settings & cache" action in Settings.
   */
  resetAll(): void;
}
