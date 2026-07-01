// Legacy render helpers kept for compatibility.
// Interactive UI is now powered by Ink components in src/ui/.
import type { QuizQuestion, Stats } from "../types.js";

export function renderHome(stats: Stats | null, lang: string) {
  const isZh = lang === "zh-CN";
  const streak = stats ? stats.currentStreak : 0;
  const today = stats ? stats.todayCount : 0;
  const accuracy = stats ? `${(stats.accuracy * 100).toFixed(0)}%` : "—";
  return [
    "",
    "=== QuizMe ===",
    isZh
      ? `连续: ${streak} 天  今日: ${today} 题  准确率: ${accuracy}`
      : `Streak: ${streak} days  Today: ${today}  Accuracy: ${accuracy}`,
    ""
  ].join("\n");
}

export function renderQuestion(question: QuizQuestion, index: number, total: number) {
  const lines = [
    "",
    `Q${index + 1}/${total} · ${question.topic} · Difficulty ${question.difficulty}`,
    "",
    question.question,
    ""
  ];
  for (const choice of question.choices) {
    lines.push(`  ${choice.id}. ${choice.text}`);
  }
  return lines.join("\n");
}

export function renderResult(question: QuizQuestion, selected: string) {
  const correct = selected === question.answer;
  const wrongReason = correct ? "" : `\n${selected}: ${question.whyWrong[selected] || "Not the best option in this context."}`;
  return [
    "",
    correct ? "Correct." : `Incorrect. Correct answer: ${question.answer}.`,
    question.explanation,
    wrongReason
  ].join("\n");
}
