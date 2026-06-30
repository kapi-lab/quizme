import { runInkSetup } from "../ui/renderApp.js";
import type { Language, Level, Store, UserConfig } from "../types.js";

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
  return {
    level: config.level || "mid",
    language: config.language || "en",
    dailyGoal: Number(config.dailyGoal || 5),
    soundEnabled: config.soundEnabled === true,
    createdAt: config.createdAt || new Date().toISOString()
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
