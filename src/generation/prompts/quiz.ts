import type {
  ProfileSignal,
  QuizMode,
  QuizQuestion,
  SourceSummary,
  UserConfig
} from "../../types.js";

/**
 * First line of every quiz prompt. Distinctive enough to double as a marker:
 * a transcript containing this string is one of QuizMe's own `claude -p`
 * calls, so session-context scans skip it instead of reading QuizMe's own
 * prompt/output back as "recent session" material. See getLatestClaudeSummary.
 */
export const QUIZ_PROMPT_MARKER =
  "You are QuizMe, a CLI technical interview quiz generator for developers.";

/**
 * Static instructional text for quiz generation.
 *
 * This is the part you tune when iterating on quiz quality — keep it
 * decoupled from the dynamic context (signals, recent questions, source)
 * assembled by {@link buildQuizPrompt} below.
 */
const QUIZ_PROMPT_INSTRUCTIONS = [
  QUIZ_PROMPT_MARKER,
  "Respond immediately with the final JSON. Do not think out loud, plan, or deliberate first — go straight to the answer to keep latency low.",
  "Return strict JSON only, matching the provided schema.",
  "Generate exactly 5 multiple-choice questions with exactly 4 choices (ids A, B, C, D) and exactly one best answer.",
  "Every question MUST include a `whyWrong` object with a short reason for each non-answer choice id.",
  "Lean toward questions a well-rounded engineer should genuinely know: underlying principles, technology selection and tradeoffs, comparative distinctions between similar tools or patterns, and debugging / code-review judgment.",
  "Each question in the batch MUST probe a distinct concept — vary the topic, depth, and angle so no two questions read as restatements of each other.",
  "Prefer questions with a spark of intrigue and a clear, transferable takeaway: the reader should learn something concrete, not merely be quizzed. Keep them broadly applicable across teams and codebases.",
  "Lean toward current, trending topics — and favor the AI / large-language-model space (model capabilities and tradeoffs, prompting, RAG, agents/tool-use, embeddings, evals, fine-tuning vs context, inference cost/latency, and shipping LLM features in production). Still keep the batch varied; don't make every question about AI.",
  "Avoid: vague or ambiguous premises; pure business-logic trivia tied to one app; overly niche implementation details; tedious questions; anything requiring scratch arithmetic or hand-tracing long code; and questions so hard they frustrate instead of teach.",
  "Weight the batch toward the user's weak areas from profile signals below; keep a small share of strong-area questions for positive reinforcement."
].join("\n");

/**
 * Render profile signals into a compact strengths/weaknesses summary for the
 * prompt. Top 5 by score and bottom 5 with wrong answers are surfaced so the
 * generator can both reinforce and challenge the user.
 */
function summarizeSignals(signals: ProfileSignal[]): string {
  if (!signals.length) return "None yet.";
  const strongest = [...signals].sort((a, b) => b.score - a.score).slice(0, 5);
  const weakest = [...signals]
    .filter((s) => s.wrongCount > 0)
    .sort((a, b) => a.score - b.score || b.wrongCount - a.wrongCount)
    .slice(0, 5);
  const format = (s: ProfileSignal) =>
    `${s.tag}(score=${s.score.toFixed(2)}, conf=${s.confidence.toFixed(2)}, +${s.correctCount}/-${s.wrongCount})`;
  return [
    `Strong: ${strongest.map(format).join(", ") || "none"}`,
    `Weak: ${weakest.map(format).join(", ") || "none"}`
  ].join("\n");
}

/**
 * Assemble the full quiz-generation prompt: static instructions plus the
 * dynamic per-call context (level, language, mode, profile signals, recent
 * questions to avoid, and the source summary).
 */
export function buildQuizPrompt({
  source,
  config,
  recentQuestions,
  mode,
  signals
}: {
  source: SourceSummary;
  config: UserConfig;
  recentQuestions: QuizQuestion[];
  mode: QuizMode;
  signals: ProfileSignal[];
}) {
  return [
    QUIZ_PROMPT_INSTRUCTIONS,
    `User level: ${config.level}`,
    `Language for questions and explanations: ${config.language}`,
    `Mode: ${mode}`,
    "Profile signals:",
    summarizeSignals(signals),
    "Recent questions to avoid repeating (topic:question pairs):",
    JSON.stringify(recentQuestions.slice(0, 20).map((q) => ({ topic: q.topic, question: q.question }))),
    "Source context summary:",
    source.summary
  ].join("\n\n");
}
