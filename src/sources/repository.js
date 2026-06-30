import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function readIfExists(filePath, max = 4000) {
  if (!fs.existsSync(filePath)) {
    return "";
  }
  return fs.readFileSync(filePath, "utf8").slice(0, max);
}

function safeGit(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function getRepoSummary(repoPath = process.cwd()) {
  const packageJson = readIfExists(path.join(repoPath, "package.json"), 5000);
  const readme = readIfExists(path.join(repoPath, "README.md"), 5000);
  const srcFiles = fs.existsSync(repoPath)
    ? fs.readdirSync(repoPath).slice(0, 30).join(", ")
    : "";
  const gitStatus = safeGit(["status", "--short"], repoPath);
  const gitLog = safeGit(["log", "--oneline", "-5"], repoPath);
  return {
    sourceType: "repo",
    title: path.basename(repoPath),
    summary: [
      `Repository: ${repoPath}`,
      "Top-level files:",
      srcFiles,
      "package.json excerpt:",
      packageJson || "None",
      "README excerpt:",
      readme || "None",
      "Git status:",
      gitStatus || "Unavailable",
      "Recent commits:",
      gitLog || "Unavailable"
    ].join("\n")
  };
}
