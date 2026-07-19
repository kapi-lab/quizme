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

export function formatStats(store: Store, isZh: boolean): string[] {
  const stats = store.getStats();
  const week = renderWeek(stats.weekRows, isZh);
  const accuracy = `${(stats.accuracy * 100).toFixed(0)}%`;
  if (isZh) {
    return [
      "QuizMe 统计",
      `连续天数：${stats.currentStreak} 天`,
      `最长连续：${stats.longestStreak} 天`,
      `今日答题：${stats.todayCount} 题`,
      `累计答题：${stats.attemptsTotal} 题`,
      `正确率：${accuracy}`,
      `待复习：${stats.reviewPending}`,
      `深挖记录：${stats.whyCount}`,
      `经验值：${stats.xp}`,
      `等级：${stats.level}`,
      "",
      "最近 7 天：",
      week
    ];
  }
  return [
    "QuizMe Stats",
    `Streak: ${stats.currentStreak} days`,
    `Best streak: ${stats.longestStreak} days`,
    `Today: ${stats.todayCount} questions`,
    `All-time: ${stats.attemptsTotal} questions`,
    `Accuracy: ${accuracy}`,
    `Review queue: ${stats.reviewPending}`,
    `Why threads: ${stats.whyCount}`,
    `XP: ${stats.xp}`,
    `Level: ${stats.level}`,
    "",
    "Last 7 days:",
    week
  ];
}

export function formatProfile(store: Store, isZh: boolean): string[] {
  const signals = store.getProfileSignals();
  const strong =
    signals.slice(0, 3).map((item) => formatSignal(item, isZh)).join(isZh ? "、" : ", ") ||
    (isZh ? "仍在了解你的画像" : "Still learning your profile");
  const weakSignals = [...signals]
    .filter((item) => item.wrongCount > 0)
    .sort((a, b) => a.score - b.score || b.wrongCount - a.wrongCount)
    .slice(0, 3);
  const weak =
    weakSignals.map((item) => formatSignal(item, isZh)).join(isZh ? "、" : ", ") ||
    (isZh ? "数据不足" : "Not enough data");
  const profileRead = buildProfileRead(signals, isZh);
  return isZh
    ? ["QuizMe 画像", profileRead, `擅长：${strong}`, `需复习：${weak}`]
    : ["QuizMe Profile", profileRead, `Strong: ${strong}`, `Needs review: ${weak}`];
}

function formatSignal(item: ProfileSignal, isZh: boolean): string {
  return `${item.tag} (${Math.round(item.score * 100)}%, ${formatTrend(item.trend, isZh)})`;
}

function formatTrend(trend: string, isZh: boolean): string {
  if (!isZh) return trend;
  if (trend === "up") return "上升";
  if (trend === "down") return "下降";
  return trend;
}

function buildProfileRead(signals: ProfileSignal[], isZh: boolean): string {
  if (!signals.length) {
    return isZh ? "当前判断：仍在了解你的画像。" : "Current read: still learning your profile.";
  }
  const strongest = signals[0];
  const weakest = [...signals].sort((a, b) => a.score - b.score)[0];
  return isZh
    ? `当前判断：在 ${strongest.tag} 上更强，在 ${weakest.tag} 上较弱。`
    : `Current read: stronger on ${strongest.tag}, weaker on ${weakest.tag}.`;
}

function renderWeek(weekRows: [string, string][], isZh: boolean): string {
  if (!weekRows.length) {
    return isZh ? "暂无活动记录。" : "No activity yet.";
  }
  return weekRows
    .map(([day, count]) => `${day} ${"#".repeat(Number(count))} ${count}`)
    .join("\n");
}
