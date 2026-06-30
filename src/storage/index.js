import path from "node:path";
import { getAppDataDir } from "../platform/paths.js";
import { SqliteStore } from "./sqlite.js";
import { ensureDir } from "../platform/fs.js";

export function createStore() {
  let dataDir = getAppDataDir();
  try {
    ensureDir(dataDir);
  } catch {
    dataDir = path.join(process.cwd(), ".quizme");
    ensureDir(dataDir);
  }
  const dbPath = path.join(dataDir, "history.sqlite");
  const store = new SqliteStore(dbPath);
  store.init();
  return store;
}
