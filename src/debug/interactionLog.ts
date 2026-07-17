import crypto from "node:crypto";
import type { ClaudeEffort } from "../types.js";

/**
 * In-memory record of every `claude` CLI call made during this process. Powers
 * the "export debug file" action in Settings — each entry keeps the full prompt
 * we sent and the raw stdout stream we got back, so a debug dump can show the
 * complete model I/O for the session. Never persisted to disk; a fresh process
 * starts with an empty log.
 */

export type InteractionKind = "quiz" | "why";

export interface Interaction {
  kind: InteractionKind;
  /** ISO timestamp of when the call finished. */
  at: string;
  /** Model alias passed to `--model`, if any. */
  model?: string;
  /** Effort level passed to `--effort`, if any. */
  effort?: ClaudeEffort;
  /** Full prompt text sent to the CLI. */
  prompt: string;
  /** Full raw stdout (stream-json NDJSON) received from the CLI. */
  rawOutput: string;
}

const interactions: Interaction[] = [];

/**
 * A stable id for the current process/session. Used to give each session its
 * own debug file name. Derived once from the first access so re-exports within
 * one run reuse the same base name.
 */
let sessionId: string | undefined;

function buildSessionId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

export function getSessionId(): string {
  if (!sessionId) sessionId = buildSessionId();
  return sessionId;
}

export function recordInteraction(entry: Omit<Interaction, "at"> & { at?: string }): void {
  interactions.push({ ...entry, at: entry.at ?? new Date().toISOString() });
}

export function getInteractions(): Interaction[] {
  return [...interactions];
}
