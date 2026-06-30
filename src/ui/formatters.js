export function formatStats(store) {
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

export function formatProfile(store) {
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

function formatSignal(item) {
  return `${item.tag} (${Math.round(item.score * 100)}%, ${item.trend})`;
}

function buildProfileRead(signals) {
  if (!signals.length) {
    return "Current read: still learning your profile.";
  }
  const strongest = signals[0];
  const weakest = [...signals].sort((a, b) => a.score - b.score)[0];
  return `Current read: stronger on ${strongest.tag}, weaker on ${weakest.tag}.`;
}

function renderWeek(weekRows) {
  if (!weekRows.length) {
    return "No activity yet.";
  }
  return weekRows
    .map(([day, count]) => `${day} ${"#".repeat(Number(count))} ${count}`)
    .join("\n");
}
