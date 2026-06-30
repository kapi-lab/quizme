export function dedupeQuestions(questions, recentQuestions) {
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
