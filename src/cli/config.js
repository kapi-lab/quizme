import { createTerminal } from "../ui/terminal.js";

export async function ensureConfig(store) {
  const existing = store.getConfig("user");
  if (existing) {
    return normalizeConfig(existing);
  }

  const terminal = createTerminal();
  try {
    console.log("\nWelcome to QuizMe\n");
    const language = await terminal.question("Language [1 中文 / 2 English]: ");
    const level = await terminal.question("Level [1 Junior / 2 Mid / 3 Senior / 4 Staff+]: ");
    const config = {
      level: pickLevel(level),
      language: language.trim() === "1" ? "zh-CN" : "en",
      dailyGoal: 5,
      createdAt: new Date().toISOString()
    };
    store.setConfig("user", config);
    return config;
  } finally {
    terminal.close();
  }
}

export function normalizeConfig(config = {}) {
  return {
    level: config.level || "mid",
    language: config.language || "en",
    dailyGoal: Number(config.dailyGoal || 5),
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
