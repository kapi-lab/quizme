import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { QUESTION_SCHEMA } from "../generation/schema.js";
import { generateQuestionsLocally, generateWhyLocally } from "./localProvider.js";

function buildPrompt({ source, config, recentQuestions, mode }) {
  return [
    "You are QuizMe, a CLI technical interview quiz generator for developers.",
    "Return strict JSON only, matching the provided schema.",
    "Generate 3 to 5 multiple-choice questions with exactly 4 choices each and exactly one best answer.",
    "Question mix should include contextual, adjacent, and interview-style coverage.",
    "Avoid trivia. Focus on engineering judgment, debugging, tradeoffs, and code review reasoning.",
    `User level: ${config.level}`,
    `Language: ${config.language}`,
    `Mode: ${mode}`,
    "Recent questions to avoid repeating:",
    JSON.stringify(recentQuestions.slice(0, 20)),
    "Source summary:",
    source.summary
  ].join("\n\n");
}

export function generateQuestionsWithClaude({ source, config, recentQuestions, mode = "mixed" }) {
  if (process.env.QUIZME_PROVIDER === "local") {
    return generateQuestionsLocally({ source, config, recentQuestions, mode });
  }

  const prompt = buildPrompt({ source, config, recentQuestions, mode });
  try {
    const stdout = execFileSync("claude", [
      "-p",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(QUESTION_SCHEMA),
      prompt
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000
    });
    const payload = JSON.parse(stdout);
    return payload.questions.map((question, index) => ({
      ...question,
      id: question.id || `q_${crypto.createHash("sha1").update(`${source.title}:${question.question}:${index}`).digest("hex").slice(0, 10)}`
    }));
  } catch (error) {
    if (process.env.QUIZME_PROVIDER_FALLBACK === "local") {
      return generateQuestionsLocally({ source, config, recentQuestions, mode });
    }
    throw error;
  }
}

export function generateWhyWithClaude({ question, config, asked, userAnswer }) {
  if (process.env.QUIZME_PROVIDER === "local") {
    return generateWhyLocally({ question, config, asked, userAnswer });
  }

  const prompt = [
    "You are QuizMe in why mode.",
    `Language: ${config.language}`,
    `User level: ${config.level}`,
    `Question: ${question.question}`,
    `Choices: ${JSON.stringify(question.choices)}`,
    `Correct answer: ${question.answer}`,
    `User selected: ${userAnswer}`,
    `Initial explanation: ${question.explanation}`,
    `User follow-up: ${asked}`,
    "Explain the correct answer, why the wrong options are weaker, and relate it to practical engineering work.",
    "Keep the answer concise but concrete."
  ].join("\n\n");

  try {
    return execFileSync("claude", ["-p", prompt], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000
    }).trim();
  } catch (error) {
    if (process.env.QUIZME_PROVIDER_FALLBACK === "local") {
      return generateWhyLocally({ question, config, asked, userAnswer });
    }
    throw error;
  }
}
