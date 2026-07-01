import type { QuizQuestion } from "../types.js";

export function dedupeQuestions(questions: QuizQuestion[], recentQuestions: QuizQuestion[]): QuizQuestion[] {
  const seen = new Set(recentQuestions.map((item) => `${item.topic}:${item.question}`));
  return questions.filter((question) => {
    const key = `${question.topic}:${question.question}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
