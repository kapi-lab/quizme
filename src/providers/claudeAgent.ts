import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { QUESTION_SCHEMA } from "../generation/schema.js";
import { validateQuestions } from "../generation/validator.js";
import type {
  ClaudeEffort,
  ProfileSignal,
  QuizMode,
  QuizQuestion,
  SourceSummary,
  UserConfig
} from "../types.js";

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

function extractQuestionsPayload(value: unknown): { questions?: unknown[] } | null {
  if (!isObject(value)) {
    return null;
  }
  if (!("questions" in value)) {
    return null;
  }
  return Array.isArray(value.questions) ? (value as { questions?: unknown[] }) : null;
}

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

function buildQuizPrompt({
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
    "You are QuizMe, a CLI technical interview quiz generator for developers.",
    "Return strict JSON only, matching the provided schema.",
    "Generate 3 to 5 multiple-choice questions with exactly 4 choices (ids A, B, C, D) and exactly one best answer.",
    "Every question MUST include a `sourceMode` field, one of: contextual (about the session/repo), adjacent (related tools/frameworks/concepts), interview_style (evergreen interview knowledge).",
    "Target mix across the batch: ~40% contextual, ~40% adjacent, ~20% interview_style.",
    "Every question MUST include a `whyWrong` object with a short reason for each non-answer choice id.",
    "Focus on engineering judgment, debugging, tradeoffs, and code review reasoning — not trivia.",
    "Weight the batch toward the user's weak areas from profile signals below; keep a small share of strong-area questions for positive reinforcement.",
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

/**
 * Print-mode hardening for scripted calls.
 * - `--bare`: skip hooks, MCP, CLAUDE.md auto-discovery, etc.
 * - `--tools ""`: disable built-in agent tools (Read/Bash/Edit/...).
 * Context is already embedded in the prompt; `--json-schema` structured output
 * is separate from the built-in tool set.
 */
const CLAUDE_PRINT_SECURITY_ARGS = ["--bare", "--tools", ""] as const;

/**
 * Effort levels accepted by `claude --effort`. Anything outside this set is
 * ignored so a stray config value never produces an invalid CLI flag.
 */
const VALID_EFFORTS: ReadonlySet<ClaudeEffort> = new Set([
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
]);

/**
 * Build the `--model` / `--effort` flag pair for a `claude` print-mode call.
 * Empty/unknown values are dropped so we never pass an invalid flag — the
 * account default model/effort applies instead.
 */
function buildModelArgs(model?: string, effort?: ClaudeEffort): string[] {
  const args: string[] = [];
  const trimmedModel = typeof model === "string" ? model.trim() : "";
  if (trimmedModel) {
    args.push("--model", trimmedModel);
  }
  if (effort && VALID_EFFORTS.has(effort)) {
    args.push("--effort", effort);
  }
  return args;
}

/**
 * Resolve why-mode model/effort from the environment. Why mode is a deep,
 * on-demand explanation — it's tuned separately from quiz generation so a
 * faster/cheaper quiz default doesn't force the tutor down to the same tier.
 */
function buildWhyModelArgs(): string[] {
  const model = process.env.QUIZME_CLAUDE_WHY_MODEL?.trim();
  const effort = process.env.QUIZME_CLAUDE_WHY_EFFORT?.trim() as ClaudeEffort | undefined;
  return buildModelArgs(model, effort);
}

/**
 * Whether `claude` has already been verified this process. The check
 * is cheap but synchronous, so we avoid repeating it on every generation call.
 */
let claudeAvailableVerified = false;

/**
 * Resolved absolute path to the `claude` binary, cached after first lookup.
 * `null` means "defer to PATH" (i.e. spawn `"claude"` and let the OS resolve).
 * `undefined` means "not yet looked up".
 */
let claudeBinPath: string | null | undefined = undefined;

/**
 * Locations we probe for the `claude` CLI when it isn't on PATH. This covers
 * the common install paths that GUI launchers / IDE integrated terminals often
 * strip from PATH (notably `~/.local/bin`, where the native installer drops it).
 */
const CLAUDE_BIN_CANDIDATES: string[] = (() => {
  const home = os.homedir();
  const candidates = [
    path.join(home, ".local/bin/claude"),
    path.join(home, ".volta/bin/claude"),
    path.join(home, ".bun/bin/claude"),
    path.join(home, ".npm-global/bin/claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude"
  ];
  // nvm: probe each installed node version's bin dir.
  const nvmDir = process.env.NVM_DIR ?? path.join(home, ".nvm");
  try {
    const versions = existsSync(path.join(nvmDir, "versions/node"))
      ? spawnSync("ls", [path.join(nvmDir, "versions/node")], { encoding: "utf8" }).stdout?.trim().split(/\s+/) ?? []
      : [];
    for (const v of versions) {
      if (v) candidates.push(path.join(nvmDir, "versions/node", v, "bin/claude"));
    }
  } catch {
    // ignore — nvm probe is best-effort
  }
  return candidates;
})();

/**
 * Resolve the `claude` CLI binary path. Honors `QUIZME_CLAUDE_BIN` first, then
 * PATH lookup, then a list of well-known install locations. Returns the
 * absolute path if found, or `null` to fall back to a plain `claude` spawn.
 */
function resolveClaudeBin(): string | null {
  if (claudeBinPath !== undefined) return claudeBinPath;

  // 1. Explicit override.
  const override = process.env.QUIZME_CLAUDE_BIN;
  if (override) {
    claudeBinPath = override;
    return claudeBinPath;
  }

  // 2. On PATH.
  const pathCheck = spawnSync("claude", ["--version"], {
    stdio: "ignore",
    shell: process.platform === "win32"
  });
  if (!pathCheck.error && pathCheck.status === 0) {
    claudeBinPath = null; // let spawn resolve via PATH
    return claudeBinPath;
  }

  // 3. Well-known install locations.
  for (const candidate of CLAUDE_BIN_CANDIDATES) {
    if (existsSync(candidate)) {
      const verify = spawnSync(candidate, ["--version"], { stdio: "ignore" });
      if (!verify.error && verify.status === 0) {
        claudeBinPath = candidate;
        return claudeBinPath;
      }
    }
  }

  claudeBinPath = null;
  return claudeBinPath;
}

/**
 * Pre-flight check: ensure the `claude` CLI is installed before we spawn a
 * long-running print-mode call. Throws a clear, actionable error instead of
 * letting `spawn` fail later with a generic ENOENT.
 */
function ensureClaudeAvailable(): void {
  if (claudeAvailableVerified) return;
  const bin = resolveClaudeBin();
  const result = bin
    ? spawnSync(bin, ["--version"], { stdio: "ignore" })
    : spawnSync("claude", ["--version"], {
        stdio: "ignore",
        shell: process.platform === "win32"
      });
  if (result.error || result.status !== 0) {
    throw new Error(
      [
        "Claude Code CLI (`claude`) was not found on your PATH.",
        "QuizMe needs it for quiz generation and the `why` mode.",
        "",
        "Install it with:  npm install -g @anthropic-ai/claude-code",
        "Docs:             https://docs.anthropic.com/claude-code",
        "",
        "If it is installed but not on this process's PATH, set",
        "  QUIZME_CLAUDE_BIN=/absolute/path/to/claude",
        "(also checked: " + CLAUDE_BIN_CANDIDATES.join(", ") + ")",
        "",
        "Note: an offline local provider (QUIZME_PROVIDER=local) is documented",
        "but not yet implemented — the CLI still requires `claude`."
      ].join("\n")
    );
  }
  claudeAvailableVerified = true;
}

async function runClaude(
  args: string[],
  { onEvent, timeout = 120000 }: { onEvent?: (event: ClaudeEvent) => void; timeout?: number } = {}
) {
  return new Promise<string>((resolve, reject) => {
    const bin = resolveClaudeBin() ?? "claude";
    const child = spawn(bin, [...CLAUDE_PRINT_SECURITY_ARGS, ...args], {
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

function parseQuestionsFromEvents(events: ClaudeEvent[]): { questions?: unknown[] } | null {
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
  signals = [],
  onProgress
}: {
  source: SourceSummary;
  config: UserConfig;
  recentQuestions: QuizQuestion[];
  mode?: QuizMode;
  signals?: ProfileSignal[];
  onProgress?: (chunk: string) => void;
}): Promise<QuizQuestion[]> {
  ensureClaudeAvailable();
  const prompt = buildQuizPrompt({ source, config, recentQuestions, mode, signals });
  const events: ClaudeEvent[] = [];

  await runClaude(
    [
      ...buildModelArgs(config.claudeModel, config.claudeEffort),
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

  const questions = validateQuestions(parsed);

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
  ensureClaudeAvailable();
  const prompt = buildWhyPrompt({ question, config, asked, userAnswer });
  const events: ClaudeEvent[] = [];
  let streamedText = "";

  await runClaude(
    ["-p", ...buildWhyModelArgs(), "--output-format", "stream-json", "--verbose", prompt],
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
