import { runInkSetup } from "../ui/renderApp.js";
import type { ClaudeEffort, Language, Level, Store, UserConfig } from "../types.js";

const DEFAULT_CLAUDE_MODEL = "haiku";
const DEFAULT_CLAUDE_EFFORT: ClaudeEffort = "low";

function normalizeEffort(value: unknown): ClaudeEffort | undefined {
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh" ||
    value === "max"
  ) {
    return value;
  }
  return undefined;
}

export async function ensureConfig(store: Store): Promise<UserConfig> {
  const existing = store.getConfig("user");
  if (existing) {
    return normalizeConfig(existing);
  }

  const config = await runInkSetup({
    onComplete: (next: UserConfig) => {
      store.setConfig("user", next);
    }
  });
  return normalizeConfig(config);
}

export function normalizeConfig(config: Partial<UserConfig> = {}): UserConfig {
  const claudeModel =
    typeof config.claudeModel === "string" && config.claudeModel.trim()
      ? config.claudeModel.trim()
      : DEFAULT_CLAUDE_MODEL;
  const claudeEffort = normalizeEffort(config.claudeEffort) ?? DEFAULT_CLAUDE_EFFORT;
  return {
    level: config.level || "mid",
    language: config.language || "en",
    dailyGoal: Number(config.dailyGoal || 5),
    soundEnabled: config.soundEnabled === true,
    createdAt: config.createdAt || new Date().toISOString(),
    claudeModel,
    claudeEffort
  };
}

function pickLevel(value: string | number): Level {
  switch (String(value).trim()) {
    case "1": return "junior";
    case "3": return "senior";
    case "4": return "staff";
    default: return "mid";
  }
}

export function isValidLevel(value: string): value is Level {
  return value === "junior" || value === "mid" || value === "senior" || value === "staff";
}

export function isValidLanguage(value: string): value is Language {
  return value === "zh-CN" || value === "en";
}

export { pickLevel };
