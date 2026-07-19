import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "./json.js";
import type { Store } from "../types.js";

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function getAppDataDir(): string {
  if (process.env.QUIZME_DATA_DIR) {
    return process.env.QUIZME_DATA_DIR;
  }

  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "quizme");
  }

  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "quizme");
  }

  return path.join(process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "quizme");
}

/**
 * The data dir `createStore` actually used this process — captures the
 * `./.quizme` fallback when the platform app-data dir wasn't writable, so a
 * later debug export reads json files from the real location.
 */
let resolvedDataDir: string | undefined;

/** Data dir in use for the current process, or the computed default if the store isn't created yet. */
export function getResolvedDataDir(): string {
  return resolvedDataDir ?? getAppDataDir();
}

export function createStore(): Store {
  let dataDir = getAppDataDir();
  try {
    ensureDir(dataDir);
  } catch {
    dataDir = path.join(process.cwd(), ".quizme");
    ensureDir(dataDir);
  }
  resolvedDataDir = dataDir;
  const store = new JsonStore(path.join(dataDir, "quizme.json"));
  store.init();
  return store;
}
