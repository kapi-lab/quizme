export type Language = "zh-CN" | "en";
export type Level = "junior" | "mid" | "senior" | "staff";
export type QuizMode = "mixed" | "review";

/** Effort levels accepted by the `claude` CLI `--effort` flag. */
export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type SourceType = "manual" | "topic" | "repo" | "claude_session";
export type QuestionSourceMode = "contextual" | "adjacent" | "interview_style";

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
  /**
   * Persist a pre-generated batch keyed by a config signature. Unlike the
   * in-memory question bank, this survives across runs so a batch generated in
   * the background but never played is reused next launch instead of wasted.
   */
  saveQuestionCache(questions: QuizQuestion[], signature: string): void;
  /**
   * Return and clear the cached batch if it matches `signature`; null
   * otherwise. A signature mismatch means the config changed since the batch
   * was made, so the stale cache is discarded on read.
   */
  takeQuestionCache(signature: string): QuizQuestion[] | null;
  /** Whether a non-empty cached batch matching `signature` is available. */
  hasQuestionCache(signature: string): boolean;
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
  getStats(): Stats;
  /**
   * Wipe all persisted state — config, stats, profile signals, the review
   * queue — plus the in-memory question bank for the current round. Used by
   * the "clear settings & cache" action in Settings.
   */
  resetAll(): void;
}
