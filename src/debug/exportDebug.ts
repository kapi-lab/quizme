import fs from "node:fs";
import path from "node:path";
import { getResolvedDataDir } from "../storage/index.js";
import { getInteractions, getSessionId } from "./interactionLog.js";
import { QUIZME_VERSION } from "../version.js";
import type { Interaction } from "./interactionLog.js";
import type { UserConfig } from "../types.js";

/**
 * Write a self-contained HTML debug dump of the current session into the
 * directory QuizMe was launched from (`process.cwd()`). The file bundles every
 * locally-stored json file (config, stats, profile, caches) and the full
 * prompt/output of every `claude` CLI call made this run. Each session gets its
 * own file name so repeated runs never clobber each other.
 */

export type ExportResult = { ok: true; path: string } | { ok: false; error: string };

interface JsonFileDump {
  name: string;
  content: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Read and pretty-print every `*.json` file in the data dir. */
function collectJsonFiles(dataDir: string): JsonFileDump[] {
  let names: string[];
  try {
    names = fs.readdirSync(dataDir).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const dumps: JsonFileDump[] = [];
  for (const name of names) {
    try {
      const raw = fs.readFileSync(path.join(dataDir, name), "utf8");
      let content = raw;
      try {
        content = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        // leave malformed json as-is so the dump still shows the raw bytes
      }
      dumps.push({ name, content });
    } catch {
      // unreadable file — skip
    }
  }
  return dumps;
}

/**
 * Pretty-print the stream-json stdout: one parsed event per line, re-indented.
 * Falls back to the raw text if a line isn't JSON so nothing is ever dropped.
 */
function formatRawOutput(raw: string): string {
  const lines = raw.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.stringify(JSON.parse(trimmed), null, 2));
    } catch {
      out.push(line);
    }
  }
  return out.join("\n\n");
}

function renderInteraction(item: Interaction, index: number, labels: Labels): string {
  const meta = [
    `${labels.kind}: ${item.kind}`,
    `${labels.time}: ${item.at}`,
    item.model ? `${labels.model}: ${item.model}` : `${labels.model}: ${labels.def}`,
    item.effort ? `${labels.effort}: ${item.effort}` : `${labels.effort}: ${labels.def}`
  ].join(" · ");
  return `
    <section class="interaction">
      <h3>#${index + 1} <span class="badge ${item.kind}">${item.kind}</span></h3>
      <div class="meta">${escapeHtml(meta)}</div>
      <h4>${labels.prompt}</h4>
      <pre>${escapeHtml(item.prompt)}</pre>
      <h4>${labels.output}</h4>
      <pre>${escapeHtml(formatRawOutput(item.rawOutput))}</pre>
    </section>`;
}

function renderJsonFile(file: JsonFileDump): string {
  return `
    <section class="jsonfile">
      <h3>${escapeHtml(file.name)}</h3>
      <pre>${escapeHtml(file.content)}</pre>
    </section>`;
}

interface Labels {
  title: string;
  session: string;
  exportedAt: string;
  cwd: string;
  dataDir: string;
  jsonSection: string;
  interactionsSection: string;
  noInteractions: string;
  noJson: string;
  kind: string;
  time: string;
  model: string;
  effort: string;
  prompt: string;
  output: string;
  def: string;
}

const LABELS_ZH: Labels = {
  title: "QuizMe 调试导出",
  session: "会话",
  exportedAt: "导出时间",
  cwd: "启动目录",
  dataDir: "数据目录",
  jsonSection: "本地存储 JSON 文件",
  interactionsSection: "大模型交互记录",
  noInteractions: "本次会话尚无大模型交互记录。",
  noJson: "数据目录中未找到 JSON 文件。",
  kind: "类型",
  time: "时间",
  model: "模型",
  effort: "Effort",
  prompt: "输入（Prompt）",
  output: "输出（原始流）",
  def: "默认"
};

const LABELS_EN: Labels = {
  title: "QuizMe Debug Export",
  session: "Session",
  exportedAt: "Exported at",
  cwd: "Launch dir",
  dataDir: "Data dir",
  jsonSection: "Local storage JSON files",
  interactionsSection: "Model interactions",
  noInteractions: "No model interactions recorded in this session yet.",
  noJson: "No JSON files found in the data dir.",
  kind: "kind",
  time: "time",
  model: "model",
  effort: "effort",
  prompt: "Input (prompt)",
  output: "Output (raw stream)",
  def: "default"
};

function buildHtml({
  labels,
  sessionId,
  exportedAt,
  cwd,
  dataDir,
  jsonFiles,
  interactions
}: {
  labels: Labels;
  sessionId: string;
  exportedAt: string;
  cwd: string;
  dataDir: string;
  jsonFiles: JsonFileDump[];
  interactions: Interaction[];
}): string {
  const jsonBlocks = jsonFiles.length
    ? jsonFiles.map(renderJsonFile).join("\n")
    : `<p class="empty">${labels.noJson}</p>`;
  const interactionBlocks = interactions.length
    ? interactions.map((it, i) => renderInteraction(it, i, labels)).join("\n")
    : `<p class="empty">${labels.noInteractions}</p>`;

  return `<!DOCTYPE html>
<html lang="${labels === LABELS_ZH ? "zh-CN" : "en"}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${labels.title} · ${escapeHtml(sessionId)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; padding: 2rem; background: #0f1115; color: #e6e6e6; line-height: 1.5; }
  h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
  h2 { font-size: 1.2rem; margin: 2.5rem 0 1rem; border-bottom: 1px solid #333; padding-bottom: 0.4rem; }
  h3 { font-size: 1rem; margin: 1.5rem 0 0.5rem; color: #9fd3ff; }
  h4 { font-size: 0.85rem; margin: 1rem 0 0.3rem; color: #b0b0b0; text-transform: uppercase; letter-spacing: 0.05em; }
  .summary { color: #a0a0a0; font-size: 0.9rem; }
  .summary code { color: #e6c07b; }
  .meta { color: #8a8a8a; font-size: 0.85rem; margin-bottom: 0.5rem; }
  pre { background: #1a1d23; border: 1px solid #2a2e37; border-radius: 6px; padding: 1rem; overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-family: "SF Mono", "Cascadia Code", Menlo, Consolas, monospace; font-size: 0.8rem; }
  .badge { display: inline-block; font-size: 0.7rem; padding: 0.1rem 0.5rem; border-radius: 999px; vertical-align: middle; }
  .badge.quiz { background: #274690; color: #cfe0ff; }
  .badge.why { background: #6b4f1d; color: #ffe6b0; }
  .empty { color: #8a8a8a; font-style: italic; }
</style>
</head>
<body>
  <h1>${labels.title}</h1>
  <div class="summary">
    <div>${labels.session}: <code>${escapeHtml(sessionId)}</code> · QuizMe v${escapeHtml(QUIZME_VERSION)}</div>
    <div>${labels.exportedAt}: <code>${escapeHtml(exportedAt)}</code></div>
    <div>${labels.cwd}: <code>${escapeHtml(cwd)}</code></div>
    <div>${labels.dataDir}: <code>${escapeHtml(dataDir)}</code></div>
  </div>

  <h2>${labels.jsonSection}</h2>
  ${jsonBlocks}

  <h2>${labels.interactionsSection} (${interactions.length})</h2>
  ${interactionBlocks}
</body>
</html>
`;
}

export function exportDebugFile({ config }: { config: UserConfig }): ExportResult {
  try {
    const labels = config.language === "zh-CN" ? LABELS_ZH : LABELS_EN;
    const dataDir = getResolvedDataDir();
    const cwd = process.cwd();
    const sessionId = getSessionId();
    const jsonFiles = collectJsonFiles(dataDir);
    const interactions = getInteractions();
    const html = buildHtml({
      labels,
      sessionId,
      exportedAt: new Date().toISOString(),
      cwd,
      dataDir,
      jsonFiles,
      interactions
    });
    const outPath = path.join(cwd, `quizme-debug-${sessionId}.html`);
    fs.writeFileSync(outPath, html, "utf8");
    return { ok: true, path: outPath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
