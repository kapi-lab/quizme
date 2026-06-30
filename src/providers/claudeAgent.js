import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { QUESTION_SCHEMA } from "../generation/schema.js";

function buildQuizPrompt({ source, config, recentQuestions, mode }) {
  return [
    "You are QuizMe, a CLI technical interview quiz generator for developers.",
    "Return strict JSON only, matching the provided schema.",
    "Generate 3 to 5 multiple-choice questions with exactly 4 choices each and exactly one best answer.",
    "Question mix: 40% contextual (related to session/repo), 40% adjacent knowledge, 20% interview-style.",
    "Focus on engineering judgment, debugging, tradeoffs, and code review reasoning — not trivia.",
    `User level: ${config.level}`,
    `Language for questions and explanations: ${config.language}`,
    `Mode: ${mode}`,
    "Recent questions to avoid repeating (topic:question pairs):",
    JSON.stringify(recentQuestions.slice(0, 20).map((q) => ({ topic: q.topic, question: q.question }))),
    "Source context summary:",
    source.summary
  ].join("\n\n");
}

function buildWhyPrompt({ question, config, asked, userAnswer }) {
  return [
    "You are QuizMe in why mode — an expert technical tutor.",
    `Language: ${config.language}`,
    `User level: ${config.level}`,
    `Question: ${question.question}`,
    `Choices: ${JSON.stringify(question.choices)}`,
    `Correct answer: ${question.answer}`,
    `User selected: ${userAnswer}`,
    `Initial explanation: ${question.explanation}`,
    `User follow-up question: ${asked}`,
    "Provide a concise, concrete explanation. Explain why the correct answer is right, why each wrong option is weaker, and connect the concept to practical engineering work. Stay focused on this question — do not become a general tutor."
  ].join("\n\n");
}

async function runClaude(args, { onEvent, timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const chunks = [];
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      reject(new Error("Claude timed out after " + timeout / 1000 + "s"));
    }, timeout);

    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      chunks.push(chunk.toString());

      // Parse complete newline-delimited JSON events
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (onEvent) {
          try {
            const event = JSON.parse(trimmed);
            onEvent(event);
          } catch {
            // not a JSON event line, ignore
          }
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        return;
      }
      if (code !== 0) {
        const msg = stderr.trim() || `claude exited with code ${code}`;
        reject(new Error(msg));
        return;
      }
      resolve(chunks.join(""));
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn claude: ${err.message}. Is Claude Code installed and in PATH?`));
    });
  });
}

function parseQuestionsFromEvents(events) {
  for (const event of events) {
    if (event.type === "assistant" && Array.isArray(event.message?.content)) {
      for (const block of event.message.content) {
        // StructuredOutput tool_use contains the JSON schema result
        if (block.type === "tool_use" && block.name === "StructuredOutput" && block.input) {
          if (Array.isArray(block.input.questions)) {
            return block.input;
          }
          // The input itself might be the questions object
          return block.input;
        }
        // Fallback: text block containing JSON
        if (block.type === "text" && block.text) {
          try {
            const parsed = JSON.parse(block.text);
            if (parsed.questions) return parsed;
          } catch {
            // not JSON
          }
        }
      }
    }
    // result event may have JSON in result field
    if (event.type === "result" && event.result) {
      try {
        const parsed = JSON.parse(event.result);
        if (parsed.questions) return parsed;
      } catch {
        // not JSON
      }
    }
  }
  return null;
}

function extractTextFromEvents(events) {
  const parts = [];
  for (const event of events) {
    if (event.type === "assistant" && Array.isArray(event.message?.content)) {
      for (const block of event.message.content) {
        if (block.type === "text") {
          parts.push(block.text);
        }
      }
    }
    if (event.type === "result" && event.result) {
      return event.result;
    }
  }
  return parts.join("");
}

export async function generateQuestions({ source, config, recentQuestions, mode = "mixed", onProgress }) {
  const prompt = buildQuizPrompt({ source, config, recentQuestions, mode });
  const events = [];

  await runClaude(
    [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--json-schema", JSON.stringify(QUESTION_SCHEMA),
      prompt
    ],
    {
      timeout: 300000,
      onEvent: (event) => {
        events.push(event);
        if (onProgress && event.type === "assistant") {
          onProgress(".");
        }
      }
    }
  );

  const parsed = parseQuestionsFromEvents(events);
  if (!parsed) {
    throw new Error("Claude returned no questions. Try again or use a different source.");
  }

  const questions = parsed.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Claude returned an empty questions array.");
  }

  return questions.map((q, index) => ({
    ...q,
    id: q.id || `q_${crypto.createHash("sha1").update(`${source.title}:${q.question}:${index}`).digest("hex").slice(0, 10)}`
  }));
}

export async function generateWhy({ question, config, asked, userAnswer, onProgress }) {
  const prompt = buildWhyPrompt({ question, config, asked, userAnswer });
  const events = [];
  let streamedText = "";

  await runClaude(
    ["-p", "--output-format", "stream-json", "--verbose", prompt],
    {
      onEvent: (event) => {
        events.push(event);
        if (onProgress && event.type === "assistant" && Array.isArray(event.message?.content)) {
          for (const block of event.message.content) {
            if (block.type === "text" && block.text) {
              streamedText += block.text;
              onProgress(block.text);
            }
          }
        }
      }
    }
  );

  if (streamedText) {
    return streamedText;
  }
  return extractTextFromEvents(events).trim();
}
