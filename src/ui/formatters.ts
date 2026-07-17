import type { ProfileSignal, SourceSummary, Store, UserConfig } from "../types.js";

export function formatSourceMode(
  source: SourceSummary,
  isZh: boolean
): string {
  switch (source.sourceType) {
    case "claude_session":
      return isZh ? "Claude Code 记录" : "Claude Code session";
    case "repo":
      return isZh ? "代码仓库" : "Code repository";
    case "topic":
      return isZh ? "用户指定提示词" : "User prompt";
    default:
      return isZh ? "手动" : "Manual";
  }
}

/**
 * The model backend QuizMe reaches the model through, plus the configured
 * model alias. The backend is currently always the local `claude` CLI; a
 * direct-API path is proposed in docs/direct-api-provider.md but not yet built,
 * so this reflects reality rather than a config toggle that doesn't exist.
 */
export function formatModelSource(config: UserConfig, isZh: boolean): string {
  const backend = "Claude CLI";
  const model = config.claudeModel?.trim();
  const modelLabel = model || (isZh ? "账户默认" : "account default");
  return isZh
    ? `模型来源：${backend} · ${modelLabel}`
    : `Model: ${backend} · ${modelLabel}`;
}

export function formatStats(store: Store): string[] {
  const stats = store.getStats();
  const week = renderWeek(stats.weekRows);
  return [
    "QuizMe Stats",
    `Streak: ${stats.currentStreak} days`,
    `Best streak: ${stats.longestStreak} days`,
    `Today: ${stats.todayCount} questions`,
    `All-time: ${stats.attemptsTotal} questions`,
    `Accuracy: ${(stats.accuracy * 100).toFixed(0)}%`,
    `Review queue: ${stats.reviewPending}`,
    `Why threads: ${stats.whyCount}`,
    `XP: ${stats.xp}`,
    `Level: ${stats.level}`,
    "",
    "Last 7 days:",
    week
  ];
}

export function formatProfile(store: Store): string[] {
  const signals = store.getProfileSignals();
  const strong = signals.slice(0, 3).map(formatSignal).join(", ") || "Still learning your profile";
  const weakSignals = [...signals]
    .filter((item) => item.wrongCount > 0)
    .sort((a, b) => a.score - b.score || b.wrongCount - a.wrongCount)
    .slice(0, 3);
  const weak = weakSignals.map(formatSignal).join(", ") || "Not enough data";
  const profileRead = buildProfileRead(signals);
  return [
    "QuizMe Profile",
    profileRead,
    `Strong: ${strong}`,
    `Needs review: ${weak}`
  ];
}

function formatSignal(item: ProfileSignal): string {
  return `${item.tag} (${Math.round(item.score * 100)}%, ${item.trend})`;
}

function buildProfileRead(signals: ProfileSignal[]): string {
  if (!signals.length) {
    return "Current read: still learning your profile.";
  }
  const strongest = signals[0];
  const weakest = [...signals].sort((a, b) => a.score - b.score)[0];
  return `Current read: stronger on ${strongest.tag}, weaker on ${weakest.tag}.`;
}

function renderWeek(weekRows: [string, string][]): string {
  if (!weekRows.length) {
    return "No activity yet.";
  }
  return weekRows
    .map(([day, count]) => `${day} ${"#".repeat(Number(count))} ${count}`)
    .join("\n");
}
