import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getOwnSessionIds, pruneStaleExclusions } from "../storage/sessionExclusions.js";
import type { SourceSummary } from "../types.js";

function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), ".claude", "projects");
}

type JsonRecord = Record<string, unknown>;

type SessionPreview = {
  cwd: string;
  userCount: number;
  assistantCount: number;
  promptPreview: string;
};

function isObject(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object";
}

function getMessageContent(row: JsonRecord): string | null {
  const message = row.message;
  if (!isObject(message)) {
    return null;
  }
  return typeof message.content === "string" ? message.content : null;
}

function parseJsonLines(filePath: string): JsonRecord[] {
  const content = fs.readFileSync(filePath, "utf8");
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

function listSessionFiles(projectDir: string): string[] {
  return fs.readdirSync(projectDir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => path.join(projectDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function summarizeRows(rows: JsonRecord[]): SessionPreview {
  const userRows = rows.filter((row) => row.type === "user" && getMessageContent(row));
  const assistantRows = rows.filter((row) => row.type === "assistant" && getMessageContent(row));
  const cwdRow = rows.find((row) => typeof row.cwd === "string");
  const cwd = typeof cwdRow?.cwd === "string" ? cwdRow.cwd : "unknown";

  return {
    cwd,
    userCount: userRows.length,
    assistantCount: assistantRows.length,
    promptPreview: userRows
      .slice(-3)
      .map((row) => {
        const content = getMessageContent(row);
        return (content ?? "").replace(/\s+/g, " ").trim();
      })
      .join("\n")
  };
}

/**
 * How many of the most recent sessions to draw candidates from. Sampling a
 * pool (not just the single newest) keeps the background context fresh across
 * runs — the same question set isn't always anchored to whichever session
 * happened to be touched last.
 */
const RECENT_SESSION_POOL = 10;

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
  const allFiles = fs.readdirSync(projectsDir)
    .flatMap((entry) => {
      const dir = path.join(projectsDir, entry);
      try {
        if (!fs.statSync(dir).isDirectory()) return [];
        return listSessionFiles(dir);
      } catch {
        return [];
      }
    })
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  // An excluded id only matters while its transcript still ranks within the
  // pool window; once newer sessions push it further down the mtime order it
  // can never climb back in, so there's nothing left for the exclusion to do.
  pruneStaleExclusions(allFiles.map((filePath) => path.basename(filePath, ".jsonl")), RECENT_SESSION_POOL);

  // Exclude transcripts QuizMe's own `claude -p` calls produced — otherwise a
  // scan can read back QuizMe's own generated prompt/output as "recent
  // session" context. See recordOwnSession() in claudeAgent.ts.
  const ownSessionIds = getOwnSessionIds();
  return allFiles.filter((filePath) => !ownSessionIds.has(path.basename(filePath, ".jsonl")));
}

/**
 * Pick `count` items from `items` uniformly at random without replacement
 * (Fisher–Yates partial shuffle). Returns at most `min(count, items.length)`
 * items, preserving the original (newest-first) order for readability.
 */
function pickRandom<T>(items: readonly T[], count: number): T[] {
  if (items.length === 0 || count <= 0) return [];
  const k = Math.min(count, items.length);
  const indices = items.map((_, i) => i);
  for (let i = indices.length - 1; i > indices.length - k; i--) {
    const j = i - Math.floor(crypto.randomInt(i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  // The last k indices are the picked ones; sort them to keep newest-first order.
  return indices
    .slice(indices.length - k)
    .sort((a, b) => a - b)
    .map((i) => items[i]);
}

export function getClaudeSummaryFromFile(filePath: string, cwd = process.cwd()): SourceSummary {
  const rows = parseJsonLines(filePath);
  const { promptPreview } = summarizeRows(rows);
  const userMessages = rows
    .filter((row) => row.type === "user" && getMessageContent(row))
    .slice(-8)
    .map((row) => (getMessageContent(row) ?? "").replace(/\s+/g, " ").trim())
    .join("\n");
  const assistantMessages = rows
    .filter((row) => row.type === "assistant" && getMessageContent(row))
    .slice(-4)
    .map((row) => JSON.stringify(getMessageContent(row)))
    .join("\n");

  return {
    sourceType: "claude_session",
    title: path.basename(filePath),
    summary: [
      `Claude project path: ${cwd}`,
      `Transcript file: ${path.basename(filePath)}`,
      "Prompt preview:",
      promptPreview || "No recent prompt preview found.",
      "Recent user prompts:",
      userMessages || "No recent user prompts found.",
      "Recent assistant content:",
      assistantMessages || "No recent assistant messages found."
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
      `Claude project path: ${cwd}`,
      `Selected ${summaries.length} sessions (random sample from the ${RECENT_SESSION_POOL} most recent) as background context:`,
      sections.join("\n\n")
    ].join("\n")
  };
}

/**
 * Resolve the background context for a session-mode quiz: take the
 * {@link RECENT_SESSION_POOL} most recent transcripts globally, randomly pick
 * {@link SELECTED_SESSION_COUNT} of them, and merge their summaries.
 *
 * Falls back gracefully when fewer than the pool size exist — it samples from
 * whatever is available and throws only when there are no transcripts at all.
 */
export function getLatestClaudeSummary(cwd = process.cwd()): SourceSummary {
  const pool = listAllSessionFiles().slice(0, RECENT_SESSION_POOL);
  if (pool.length === 0) {
    const projectsDir = getClaudeProjectsDir();
    throw new Error(
      `No Claude project transcripts found in ${projectsDir}. Run Claude Code in this repo first, or use --repo / "topic".`
    );
  }
  const selected = pickRandom(pool, SELECTED_SESSION_COUNT);
  const summaries = selected.map((file) => getClaudeSummaryFromFile(file, cwd));
  return mergeSessionSummaries(summaries, cwd);
}
