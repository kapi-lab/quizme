import fs from "node:fs";
import path from "node:path";
import { getClaudeProjectsDir } from "../platform/paths.js";

function parseJsonLines(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function listSessionFiles(projectDir) {
  return fs.readdirSync(projectDir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => path.join(projectDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function summarizeRows(rows) {
  const userRows = rows.filter((row) => row.type === "user" && row.message?.content);
  const assistantRows = rows.filter((row) => row.type === "assistant" && row.message?.content);
  const cwd = rows.find((row) => row.cwd)?.cwd || "unknown";

  return {
    cwd,
    userCount: userRows.length,
    assistantCount: assistantRows.length,
    promptPreview: userRows
      .slice(-3)
      .map((row) => String(row.message.content).replace(/\s+/g, " ").trim())
      .join("\n")
  };
}

function findMostRecentSessionGlobally() {
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

export function inspectClaudeSessions(cwd = process.cwd(), explicitPath = null) {
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

export function getClaudeSummaryFromFile(filePath, cwd = process.cwd()) {
  const rows = parseJsonLines(filePath);
  const { promptPreview } = summarizeRows(rows);
  const userMessages = rows
    .filter((row) => row.type === "user" && row.message?.content)
    .slice(-8)
    .map((row) => String(row.message.content).replace(/\s+/g, " ").trim())
    .join("\n");
  const assistantMessages = rows
    .filter((row) => row.type === "assistant" && row.message?.content)
    .slice(-4)
    .map((row) => JSON.stringify(row.message.content))
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

export function getLatestClaudeSummary(cwd = process.cwd(), explicitPath = null) {
  const inspection = inspectClaudeSessions(cwd, explicitPath);
  if (!inspection.ok) {
    throw new Error(`${inspection.reason}. Run Claude Code in this repo first, or use --repo / "topic".`);
  }

  return getClaudeSummaryFromFile(inspection.selected, cwd);
}
