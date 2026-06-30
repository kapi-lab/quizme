import os from "node:os";
import path from "node:path";

export function getAppDataDir() {
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

export function slugifyProjectPath(projectPath) {
  return projectPath.replace(/[:\\/]+/g, "-").replace(/_/g, "-");
}

export function getClaudeRoots(cwd = process.cwd()) {
  return [
    path.join(cwd, ".claude"),
    path.join(os.homedir(), ".claude")
  ];
}

export function getClaudeProjectsDir() {
  return path.join(os.homedir(), ".claude", "projects");
}
