import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { QUESTION_SCHEMA } from "../generation/schema.js";
import type { QuizMode, QuizQuestion, SourceSummary, UserConfig } from "../types.js";

type JsonRecord = Record<string, unknown>;

type AssistantTextBlock = {
  type: "text";
  text: string;
};

type AssistantToolUseBlock = {
  type: "tool_use";
  name?: string;
  input?: unknown;
};

type AssistantBlock = AssistantTextBlock | AssistantToolUseBlock | JsonRecord;

type ClaudeAssistantEvent = {
  type: "assistant";
  message?: {
    content?: unknown;
  };
};

type ClaudeResultEvent = {
  type: "result";
  result?: string;
};

type ClaudeEvent = ClaudeAssistantEvent | ClaudeResultEvent | JsonRecord;

function isObject(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object";
}

function isAssistantEvent(event: ClaudeEvent): event is ClaudeAssistantEvent {
  return isObject(event) && event.type === "assistant";
}

function isResultEvent(event: ClaudeEvent): event is ClaudeResultEvent {
  return isObject(event) && event.type === "result";
}

function getAssistantBlocks(event: ClaudeAssistantEvent): AssistantBlock[] {
  const content = event.message?.content;
  return Array.isArray(content) ? (content as AssistantBlock[]) : [];
}

function extractQuestionsPayload(value: unknown): { questions?: QuizQuestion[] } | null {
  if (!isObject(value)) {
    return null;
  }
  if (!("questions" in value)) {
    return value as { questions?: QuizQuestion[] };
  }
  return Array.isArray(value.questions) ? (value as { questions?: QuizQuestion[] }) : null;
}

function buildQuizPrompt({
  source,
  config,
  recentQuestions,
  mode
}: {
  source: SourceSummary;
  config: UserConfig;
  recentQuestions: QuizQuestion[];
  mode: QuizMode;
}) {
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

function buildWhyPrompt({
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

async function runClaude(
  args: string[],
  { onEvent, timeout = 120000 }: { onEvent?: (event: ClaudeEvent) => void; timeout?: number } = {}
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const chunks: string[] = [];
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
      buffer = lines.pop() ?? ""; // keep incomplete line in buffer

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

function parseQuestionsFromEvents(events: ClaudeEvent[]): { questions?: QuizQuestion[] } | null {
  for (const event of events) {
    if (isAssistantEvent(event)) {
      for (const block of getAssistantBlocks(event)) {
        // StructuredOutput tool_use contains the JSON schema result
        if (isObject(block) && block.type === "tool_use" && block.name === "StructuredOutput" && block.input) {
          const payload = extractQuestionsPayload(block.input);
          if (payload) {
            return payload;
          }
        }
        // Fallback: text block containing JSON
        if (isObject(block) && block.type === "text" && typeof block.text === "string") {
          try {
            const parsed = JSON.parse(block.text);
            const payload = extractQuestionsPayload(parsed);
            if (payload) return payload;
          } catch {
            // not JSON
          }
        }
      }
    }
    // result event may have JSON in result field
    if (isResultEvent(event) && event.result) {
      try {
        const parsed = JSON.parse(event.result);
        const payload = extractQuestionsPayload(parsed);
        if (payload) return payload;
      } catch {
        // not JSON
      }
    }
  }
  return null;
}

function extractTextFromEvents(events: ClaudeEvent[]): string {
  const parts: string[] = [];
  for (const event of events) {
    if (isAssistantEvent(event)) {
      for (const block of getAssistantBlocks(event)) {
        if (isObject(block) && block.type === "text" && typeof block.text === "string") {
          parts.push(block.text);
        }
      }
    }
    if (isResultEvent(event) && event.result) {
      return event.result;
    }
  }
  return parts.join("");
}

export async function generateQuestions({
  source,
  config,
  recentQuestions,
  mode = "mixed",
  onProgress
}: {
  source: SourceSummary;
  config: UserConfig;
  recentQuestions: QuizQuestion[];
  mode?: QuizMode;
  onProgress?: (chunk: string) => void;
}): Promise<QuizQuestion[]> {
  const prompt = buildQuizPrompt({ source, config, recentQuestions, mode });
  const events: ClaudeEvent[] = [];

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
        if (onProgress && isAssistantEvent(event)) {
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

  return questions.map((q: QuizQuestion, index: number) => ({
    ...q,
    id: q.id || `q_${crypto.createHash("sha1").update(`${source.title}:${q.question}:${index}`).digest("hex").slice(0, 10)}`
  }));
}

export async function generateWhy({
  question,
  config,
  asked,
  userAnswer,
  onProgress
}: {
  question: QuizQuestion;
  config: UserConfig;
  asked: string;
  userAnswer: string;
  onProgress?: (chunk: string) => void;
}): Promise<string> {
  const prompt = buildWhyPrompt({ question, config, asked, userAnswer });
  const events: ClaudeEvent[] = [];
  let streamedText = "";

  await runClaude(
    ["-p", "--output-format", "stream-json", "--verbose", prompt],
    {
      onEvent: (event) => {
        events.push(event);
        if (onProgress && isAssistantEvent(event)) {
          for (const block of getAssistantBlocks(event)) {
            if (isObject(block) && block.type === "text" && typeof block.text === "string") {
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
