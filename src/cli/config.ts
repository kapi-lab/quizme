import { runInkSetup } from "../ui/renderApp.js";
import type { ClaudeEffort, Store, UserConfig } from "../types.js";

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
