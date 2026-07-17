import fs from "node:fs";
import path from "node:path";
import { getAppDataDir } from "./index.js";

function getExclusionFilePath(): string {
  return path.join(getAppDataDir(), "session-exclusions.json");
}

/**
 * Ids of sessions QuizMe itself generated, to exclude from "recent session"
 * context scans.
 */
export function getOwnSessionIds(): Set<string> {
  try {
    const parsed = JSON.parse(fs.readFileSync(getExclusionFilePath(), "utf8"));
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function persist(ids: Set<string>): void {
  const filePath = getExclusionFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify([...ids], null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

/**
 * Record that QuizMe itself just spawned a `claude -p` call which produced
 * session `sessionId`, so a later self-context scan (getLatestClaudeSummary)
 * skips that transcript instead of reading QuizMe's own prompt/output back
 * as "recent session" material.
 */
export function recordOwnSession(sessionId: string): void {
  if (!sessionId) return;
  const ids = getOwnSessionIds();
  ids.add(sessionId);
  persist(ids);
}

/**
 * Drop exclusion entries that had no effect this round: an id only needs
 * excluding while its transcript still ranks within the newest
 * `activeWindow` ids — once enough newer sessions exist to push it past that
 * window it can never re-enter (mtimes don't change, only new files arrive),
 * so there is nothing left for the exclusion to ever do.
 */
export function pruneStaleExclusions(idsNewestFirst: readonly string[], activeWindow: number): void {
  const active = new Set(idsNewestFirst.slice(0, activeWindow));
  const ids = getOwnSessionIds();
  const pruned = new Set([...ids].filter((id) => active.has(id)));
  if (pruned.size !== ids.size) {
    persist(pruned);
  }
}
