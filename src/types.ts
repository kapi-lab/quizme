export type Language = "zh-CN" | "en";
export type Level = "junior" | "mid" | "senior" | "staff";
export type QuizMode = "mixed" | "review";

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

export type ProfilePreferenceKind = "boost" | "suppress" | "known";

export interface ProfilePreference {
  tag: string;
  kind: ProfilePreferenceKind;
  note?: string;
  updatedAt: string;
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
  exec(sql: string): string;
  setConfig(key: string, value: unknown): void;
  getConfig<T>(key: string, fallback?: T | null): T | null;
  saveQuestion(question: QuizQuestion, sourceType: string): void;
  listRecentQuestions(limit?: number): QuizQuestion[];
  recordAttempt(payload: {
    questionId: string;
    selected: string;
    correct: boolean;
    durationMs: number;
    tags: string[];
  }): void;
  updateSignal(tag: string, wasCorrect: boolean): void;
  getProfileSignals(): ProfileSignal[];
  listProfilePreferences(): ProfilePreference[];
  upsertProfilePreference(pref: Omit<ProfilePreference, "updatedAt">): void;
  deleteProfilePreference(tag: string): void;
  clearProfilePreferences(): void;
  getStats(): Stats;
  upsertReviewItem(questionId: string, resolved: boolean): void;
  listReviewQuestionIds(limit?: number): string[];
  appendWhyThread(questionId: string, turns: WhyTurn[]): void;
  clearAttemptHistory(): void;
  clearProfileSignals(): void;
  clearWhyThreads(): void;
  clearQuestionBank(): void;
  clearAll(): void;
}
