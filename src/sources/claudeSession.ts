import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { QUIZ_PROMPT_MARKER } from "../generation/prompts/quiz.js";
import type { SourceSummary } from "../types.js";

function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), ".claude", "projects");
}

type JsonRecord = Record<string, unknown>;

type SessionTurns = {
  cwd: string;
  /** First real user prompt — the richest framing of what the session is about. */
  initialRequest: string;
  /** Subsequent user prompts, in order — the directions the user steered toward. */
  userTurns: string[];
  /** Last assistant text output — what the session concluded with / built. */
  finalOutput: string;
};

function isObject(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object";
}

/**
 * Pull human-readable text out of a message `content` field. Claude Code stores
 * content as either a plain string (typed user prompts) or an array of blocks
 * (assistant replies, tool results). We keep only `text` blocks — `thinking`,
 * `tool_use`, and `tool_result` blocks are noise for quiz context. The old
 * code only handled the string case, so assistant content (always an array)
 * was silently dropped entirely.
 */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block): block is JsonRecord => isObject(block))
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n");
  }
  return "";
}

/**
 * Tags Claude Code injects around slash commands, hooks, and command output.
 * Their inner text (`/clear`, "Set model to …", caveats) is UI plumbing, not
 * conversation, so we strip the whole tag with its contents before deciding
 * whether a message carries real signal.
 */
const NOISE_TAGS = [
  "local-command-caveat",
  "local-command-stdout",
  "command-name",
  "command-message",
  "command-args",
  "command-contents",
  "system-reminder"
];

const NOISE_TAG_RE = new RegExp(
  `<(${NOISE_TAGS.join("|")})>[\\s\\S]*?</\\1>`,
  "g"
);
const STRAY_NOISE_TAG_RE = new RegExp(`</?(${NOISE_TAGS.join("|")})[^>]*>`, "g");

/** Strip Claude Code command/hook plumbing, then normalize whitespace. */
function scrubNoise(text: string): string {
  return text
    .replace(NOISE_TAG_RE, " ")
    .replace(STRAY_NOISE_TAG_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_MESSAGE_CHARS = 500;
const MAX_FINAL_OUTPUT_CHARS = 800;
const MAX_USER_TURNS = 6;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * Read the first `bytes` of a file without loading the whole thing. QuizMe's
 * own transcripts carry the prompt marker in their very first JSONL line, so a
 * head read is enough to detect and skip them cheaply — which matters because a
 * heavy QuizMe user's most-recent transcripts are dominated by QuizMe's own runs.
 */
function readHead(filePath: string, bytes = 16384): string {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(bytes);
    const read = fs.readSync(fd, buffer, 0, bytes, 0);
    return buffer.toString("utf8", 0, read);
  } catch {
    return "";
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Cheap pre-filter for QuizMe's own `claude -p` runs: their prompt marker sits
 * in the first JSONL line, so a head read skips them without a full parse (they
 * dominate a heavy user's most-recent transcripts). Not authoritative — the
 * full-content check in {@link getClaudeSummaryFromFile} is the backstop for
 * markers buried deeper — no session-id bookkeeping needed either way.
 */
function isOwnQuizmeTranscript(filePath: string): boolean {
  return readHead(filePath).includes(QUIZ_PROMPT_MARKER);
}

function parseJsonLines(content: string): JsonRecord[] {
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        return isObject(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((row): row is JsonRecord => row !== null);
}

/**
 * Reduce a transcript to the parts worth quizzing on: the user's initial
 * request, the turns they steered through, and the assistant's final output.
 */
function extractTurns(rows: JsonRecord[]): SessionTurns {
  const cwdRow = rows.find((row) => typeof row.cwd === "string");
  const cwd = typeof cwdRow?.cwd === "string" ? cwdRow.cwd : "unknown";

  const userTexts: string[] = [];
  const assistantTexts: string[] = [];
  for (const row of rows) {
    if (row.type !== "user" && row.type !== "assistant") continue;
    const message = row.message;
    if (!isObject(message)) continue;
    const text = scrubNoise(extractText(message.content));
    if (!text) continue;
    (row.type === "user" ? userTexts : assistantTexts).push(text);
  }

  const [initialRequest = "", ...restUserTurns] = userTexts;
  return {
    cwd,
    initialRequest: truncate(initialRequest, MAX_MESSAGE_CHARS),
    userTurns: restUserTurns
      .slice(-MAX_USER_TURNS)
      .map((turn) => truncate(turn, MAX_MESSAGE_CHARS)),
    finalOutput: truncate(assistantTexts.at(-1) ?? "", MAX_FINAL_OUTPUT_CHARS)
  };
}

function listSessionFiles(projectDir: string): string[] {
  return fs.readdirSync(projectDir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => path.join(projectDir, name));
}

/**
 * How many of the most recent *usable* sessions to draw candidates from.
 * Sampling a pool (not just the single newest) keeps the background context
 * fresh across runs — the same question set isn't always anchored to whichever
 * session happened to be touched last.
 */
const RECENT_SESSION_POOL = 10;

/**
 * Upper bound on transcripts inspected while assembling the pool. A heavy
 * QuizMe user's most-recent transcripts are mostly QuizMe's own runs, so we may
 * skip past many before finding {@link RECENT_SESSION_POOL} real ones — this cap
 * keeps that bounded instead of walking every transcript on disk.
 */
const MAX_SCAN = 40;

/**
 * Scan every `~/.claude/projects/<project>/*.jsonl` transcript globally and return them
 * sorted by mtime (newest first). Scanning globally — rather than only the
 * current project dir — is intentional: users fire QuizMe from any directory
 * during Claude Code wait times and should get their latest session context
 * regardless of where they launched it from.
 */
function listAllSessionFiles(): string[] {
  const projectsDir = getClaudeProjectsDir();
  if (!fs.existsSync(projectsDir)) {
    return [];
  }
  return fs.readdirSync(projectsDir)
    .flatMap((entry) => {
      const dir = path.join(projectsDir, entry);
      try {
        if (!fs.statSync(dir).isDirectory()) return [];
        return listSessionFiles(dir);
      } catch {
        return [];
      }
    })
    .map((filePath) => ({ filePath, mtime: fs.statSync(filePath).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((entry) => entry.filePath);
}

/**
 * Shuffle a copy of `items` uniformly at random (Fisher–Yates) using a CSPRNG.
 * Used to randomize which pool transcripts we try first, so context stays fresh
 * across runs instead of always anchoring to the newest sessions.
 */
function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Build a {@link SourceSummary} from one transcript, or return `null` when it's
 * unusable: it contains the QuizMe prompt marker anywhere (a QuizMe run, or a
 * meta-conversation that quotes the prompt — neither is quiz-worthy and letting
 * the marker reach the generator would confuse it) or it carries no real
 * conversation after noise is stripped. The head-only {@link isOwnQuizmeTranscript}
 * pre-filter skips QuizMe's own runs cheaply; this full-content check is the
 * backstop for markers buried deeper in the file.
 */
function getClaudeSummaryFromFile(filePath: string): SourceSummary | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  if (content.includes(QUIZ_PROMPT_MARKER)) {
    return null;
  }

  const turns = extractTurns(parseJsonLines(content));
  if (!turns.initialRequest && turns.userTurns.length === 0 && !turns.finalOutput) {
    return null;
  }

  return {
    sourceType: "claude_session",
    title: path.basename(filePath),
    summary: [
      `Claude project path: ${turns.cwd}`,
      `Transcript file: ${path.basename(filePath)}`,
      "Initial request:",
      turns.initialRequest || "(none)",
      "User turns during the session:",
      turns.userTurns.join("\n") || "(none)",
      "Final assistant output:",
      turns.finalOutput || "(none)"
    ].join("\n")
  };
}

/**
 * How many sessions from the pool to actually feed into the prompt as
 * background context. Three is enough breadth without bloating the prompt.
 */
const SELECTED_SESSION_COUNT = 3;

/**
 * Build a single {@link SourceSummary} from multiple session transcripts,
 * each sectioned by its file name so the generator can tell them apart.
 */
function mergeSessionSummaries(
  summaries: SourceSummary[],
  cwd: string
): SourceSummary {
  if (summaries.length === 1) {
    return summaries[0];
  }
  const sections = summaries.map(
    (s, i) => `### Session ${i + 1}: ${s.title}\n${s.summary}`
  );
  return {
    sourceType: "claude_session",
    title: `${summaries.length} recent sessions`,
    summary: [
      `Launched from: ${cwd}`,
      `Selected ${summaries.length} sessions (random sample from the ${RECENT_SESSION_POOL} most recent) as background context:`,
      sections.join("\n\n")
    ].join("\n")
  };
}

/**
 * Resolve the background context for a session-mode quiz: take the
 * {@link RECENT_SESSION_POOL} most recent transcripts globally, try them in a
 * random order, and keep the first {@link SELECTED_SESSION_COUNT} that yield
 * usable content (skipping QuizMe's own runs and empty transcripts).
 *
 * Falls back gracefully when fewer usable transcripts exist and throws only
 * when none can be found.
 */
export function getLatestClaudeSummary(cwd = process.cwd()): SourceSummary {
  const allFiles = listAllSessionFiles();
  if (allFiles.length === 0) {
    const projectsDir = getClaudeProjectsDir();
    throw new Error(
      `No Claude project transcripts found in ${projectsDir}. Run Claude Code in this repo first, or use --repo / "topic".`
    );
  }

  // Walk newest-first, skipping QuizMe's own runs and empty transcripts, until
  // we've gathered a pool of usable sessions (or hit the scan cap). Sampling
  // from real sessions — not just the newest N files, which are mostly QuizMe's
  // own runs — is what keeps the pool from starving.
  const pool: SourceSummary[] = [];
  for (const file of allFiles.slice(0, MAX_SCAN)) {
    if (pool.length >= RECENT_SESSION_POOL) break;
    if (isOwnQuizmeTranscript(file)) continue;
    const summary = getClaudeSummaryFromFile(file);
    if (summary) pool.push(summary);
  }

  if (pool.length === 0) {
    throw new Error(
      "No usable Claude session context found (recent transcripts were empty or QuizMe's own runs). Use --repo / \"topic\" instead."
    );
  }

  const selected = shuffle(pool).slice(0, SELECTED_SESSION_COUNT);
  return mergeSessionSummaries(selected, cwd);
}
