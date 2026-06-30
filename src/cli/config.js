import { runInkSetup } from "../ui/renderApp.jsx";

export async function ensureConfig(store) {
  const existing = store.getConfig("user");
  if (existing) {
    return normalizeConfig(existing);
  }

  const config = await runInkSetup({
    onComplete: (next) => {
      store.setConfig("user", next);
    }
  });
  return normalizeConfig(config);
}

export function normalizeConfig(config = {}) {
  return {
    level: config.level || "mid",
    language: config.language || "en",
    dailyGoal: Number(config.dailyGoal || 5),
    soundEnabled: config.soundEnabled === true,
    createdAt: config.createdAt || new Date().toISOString()
  };
}

function pickLevel(value) {
  switch (String(value).trim()) {
    case "1": return "junior";
    case "3": return "senior";
    case "4": return "staff";
    default: return "mid";
  }
}

export function isValidLevel(value) {
  return ["junior", "mid", "senior", "staff"].includes(value);
}

export function isValidLanguage(value) {
  return ["zh-CN", "en"].includes(value);
}

export { pickLevel };
