import fs from "node:fs";
import path from "node:path";
import { getClaudeProjectsDir } from "../platform/paths.js";
import type { SourceSummary } from "../types.js";

type JsonRecord = Record<string, unknown>;

type SessionPreview = {
  cwd: string;
  userCount: number;
  assistantCount: number;
  promptPreview: string;
};

type SessionInspectError = {
  ok: false;
  reason: string;
  searched: string;
};

type SessionInspectSuccess = {
  ok: true;
  searched: string;
  files: string[];
  selected: string;
  preview: SessionPreview;
};

export type SessionInspection = SessionInspectError | SessionInspectSuccess;

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

function findMostRecentSessionGlobally(): string | null {
  const projectsDir = getClaudeProjectsDir();
  if (!fs.existsSync(projectsDir)) {
    return null;
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
  return allFiles.length ? allFiles[0] : null;
}

export function inspectClaudeSessions(explicitPath: string | null = null): SessionInspection {
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      return { ok: false, reason: `Session file not found: ${explicitPath}`, searched: explicitPath };
    }
    const rows = parseJsonLines(explicitPath);
    return {
      ok: true,
      searched: explicitPath,
      files: [explicitPath],
      selected: explicitPath,
      preview: summarizeRows(rows)
    };
  }

  const projectsDir = getClaudeProjectsDir();
  const mostRecent = findMostRecentSessionGlobally();
  if (!mostRecent) {
    return { ok: false, reason: `No Claude project transcripts found`, searched: projectsDir };
  }

  const projectDir = path.dirname(mostRecent);
  const files = listSessionFiles(projectDir);

  return {
    ok: true,
    searched: projectsDir,
    files,
    selected: mostRecent,
    preview: summarizeRows(parseJsonLines(mostRecent))
  };
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

export function getLatestClaudeSummary(cwd = process.cwd(), explicitPath: string | null = null): SourceSummary {
  const inspection = inspectClaudeSessions(explicitPath);
  if (!inspection.ok) {
    throw new Error(`${inspection.reason}. Run Claude Code in this repo first, or use --repo / "topic".`);
  }

  return getClaudeSummaryFromFile(inspection.selected, cwd);
}
