import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export function createTerminal() {
  return readline.createInterface({ input, output });
}

export function renderHome(stats, lang) {
  const isZh = lang === "zh-CN";
  const streak = stats ? stats.currentStreak : 0;
  const today = stats ? stats.todayCount : 0;
  const accuracy = stats ? `${(stats.accuracy * 100).toFixed(0)}%` : "—";
  const lines = [
    "",
    isZh ? "=== QuizMe ===" : "=== QuizMe ===",
    isZh
      ? `连续: ${streak} 天  今日: ${today} 题  准确率: ${accuracy}`
      : `Streak: ${streak} days  Today: ${today}  Accuracy: ${accuracy}`,
    "",
    isZh ? "  1. 开始答题" : "  1. Start Quiz",
    isZh ? "  2. 复习错题" : "  2. Review",
    isZh ? "  3. 查看统计" : "  3. Stats",
    isZh ? "  4. 查看档案" : "  4. Profile",
    isZh ? "  5. 设置" : "  5. Settings",
    isZh ? "  6. 退出" : "  6. Exit",
    ""
  ];
  return lines.join("\n");
}

export function renderQuestion(question, index, total) {
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
  lines.push("");
  lines.push("Answer [A-D, 1-4], or type why / next / review / stats / profile / exit:");
  return lines.join("\n");
}

export function renderResult(question, selected) {
  const correct = selected === question.answer;
  const wrongReason = correct ? "" : `\n${selected}: ${question.whyWrong[selected] || "Not the best option in this context."}`;
  return [
    "",
    correct ? "Correct." : `Incorrect. Correct answer: ${question.answer}.`,
    question.explanation,
    wrongReason,
    "",
    "Type why for a deeper explanation, next to continue, or review / stats / profile."
  ].join("\n");
}
