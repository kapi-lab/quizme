import type { QuizQuestion, UserConfig } from "../../types.js";

/**
 * Static instructional text for why-mode (on-demand explanation).
 *
 * Tuned separately from quiz generation — why mode is a deep, single-question
 * tutor drill-down, not a batch generator. Keep this decoupled from the
 * dynamic question/answer context assembled by {@link buildWhyPrompt} below.
 */
const WHY_PROMPT_INSTRUCTIONS = [
  "You are QuizMe in why mode — an expert technical tutor.",
  "Provide a concise, concrete explanation. Explain why the correct answer is right, why each wrong option is weaker, and connect the concept to practical engineering work.",
  "Stay focused on this question — do not become a general tutor."
].join("\n");

/**
 * Assemble the full why-mode prompt: static instructions plus the dynamic
 * per-call context (question, choices, correct answer, user selection, the
 * question's own explanation, and the user's follow-up).
 */
export function buildWhyPrompt({
  question,
  config,
  asked,
  userAnswer
}: {
  question: QuizQuestion;
  config: UserConfig;
  asked: string;
  userAnswer: string;
}) {
  return [
    WHY_PROMPT_INSTRUCTIONS,
    `Language: ${config.language}`,
    `User level: ${config.level}`,
    `Question: ${question.question}`,
    `Choices: ${JSON.stringify(question.choices)}`,
    `Correct answer: ${question.answer}`,
    `User selected: ${userAnswer}`,
    `Initial explanation: ${question.explanation}`,
    `User follow-up question: ${asked}`
  ].join("\n\n");
}
