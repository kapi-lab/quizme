#!/usr/bin/env -S node --import tsx
import fs from "node:fs";
import path from "node:path";
import { createStore } from "../storage/index.js";
import { ensureConfig, isValidLanguage, isValidLevel, normalizeConfig } from "./config.js";
import { runQuizSession, printProfile, printStats } from "./session.js";
import { getLatestClaudeSummary, inspectClaudeSessions } from "../sources/claudeSession.js";
import { getRepoSummary } from "../sources/repository.js";
import { getTopicSummary } from "../sources/topic.js";
import { getAppDataDir } from "../platform/paths.js";
import { runInkHome } from "../ui/renderApp.js";
import type { QuizQuestion, SourceSummary, Store, UserConfig } from "../types.js";

type CliArgs = {
  _: string[];
  repo?: string;
  session?: string;
  language?: string;
  level?: string;
  dailyGoal?: string;
  resetHistory?: boolean;
  resetProfile?: boolean;
  resetWhy?: boolean;
  all?: boolean;
  help?: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--repo") {
      args.repo = argv[i + 1];
      i += 1;
    } else if (token === "--session") {
      args.session = argv[i + 1];
      i += 1;
    } else if (token === "--language") {
      args.language = argv[i + 1];
      i += 1;
    } else if (token === "--level") {
      args.level = argv[i + 1];
      i += 1;
    } else if (token === "--daily-goal") {
      args.dailyGoal = argv[i + 1];
      i += 1;
    } else if (token === "--reset-history") {
      args.resetHistory = true;
    } else if (token === "--reset-profile") {
      args.resetProfile = true;
    } else if (token === "--reset-why") {
      args.resetWhy = true;
    } else if (token === "--all") {
      args.all = true;
    } else if (token === "--help" || token === "-h") {
      args.help = true;
    } else {
      args._.push(token);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
quizme

Usage:
  quizme
  quizme --repo .
  quizme "React rendering"
  quizme --session /path/to/session.jsonl
  quizme stats
  quizme profile
  quizme settings --language zh-CN --level senior --daily-goal 8
  quizme settings --reset-history
  quizme settings --reset-profile
  quizme settings --reset-why
  quizme review
  quizme inspect-sources
  quizme inspect-sources --session /path/to/session.jsonl
  `);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const store = createStore();
  const command = args._[0];

  if (command === "stats") {
    printStats(store);
    return;
  }
  if (command === "profile") {
    printProfile(store);
    return;
  }
  if (command === "settings") {
    return handleSettings(store);
  }
  if (command === "inspect-sources") {
    return handleInspect(args);
  }

  const config = await ensureConfig(store);

  if (command === "review") {
    return handleReview({ store, config });
  }
  if (args.repo || args.session || args._.length > 0) {
    const source = resolveSource(args);
    return runQuizSession({ store, config, source });
  }

  await runInkHome({ store, config, resolveSource });
}

function resolveSource(args: CliArgs): SourceSummary {
  if (args.repo) {
    return getRepoSummary(path.resolve(args.repo));
  }
  if (args._.length > 0) {
    return getTopicSummary(args._.join(" "));
  }
  return getLatestClaudeSummary(process.cwd(), args.session ? path.resolve(args.session) : null);
}

function handleInspect(args: CliArgs) {
  const info = inspectClaudeSessions(args.session ? path.resolve(args.session) : null);
  if (!info.ok) {
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  console.log(JSON.stringify({
    ok: info.ok,
    searched: info.searched,
    selected: info.selected,
    fileCount: info.files.length,
    preview: info.preview,
    files: info.files.slice(0, 10)
  }, null, 2));
}

async function handleReview({ store, config }: { store: Store; config: UserConfig }) {
  const ids = new Set(store.listReviewQuestionIds(5));
  const questions = store.listRecentQuestions(50).filter((item: QuizQuestion) => ids.has(item.id));
  if (!questions.length) {
    console.log("No pending review items.");
    return;
  }
  await runQuizSession({
    store,
    config,
    source: { sourceType: "manual", title: "review", summary: "Review incorrect questions." },
    questionsOverride: questions,
    mode: "review"
  });
}

async function handleSettings(store: Store) {
  const args = parseArgs(process.argv.slice(2));
  const current = normalizeConfig(
    store.getConfig("user", { language: "en", level: "mid", dailyGoal: 5 }) ?? undefined
  );

  if (args.language || args.level || args.dailyGoal) {
    const next = { ...current };
    if (args.language) {
      if (!isValidLanguage(args.language)) {
        throw new Error("Invalid language. Use zh-CN or en.");
      }
      next.language = args.language;
    }
    if (args.level) {
      if (!isValidLevel(args.level)) {
        throw new Error("Invalid level. Use junior, mid, senior, or staff.");
      }
      next.level = args.level;
    }
    if (args.dailyGoal) {
      const goal = Number(args.dailyGoal);
      if (!Number.isInteger(goal) || goal < 1) {
        throw new Error("Invalid daily goal. Use a positive integer.");
      }
      next.dailyGoal = goal;
    }
    store.setConfig("user", next);
  }

  const user = normalizeConfig(store.getConfig("user", current) ?? undefined);
  console.log([
    `App data dir: ${getAppDataDir()}`,
    `Language: ${user.language}`,
    `Level: ${user.level}`,
    `Daily goal: ${user.dailyGoal}`,
    "",
    "Use one of:",
    "  quizme settings --language zh-CN",
    "  quizme settings --level senior",
    "  quizme settings --daily-goal 8",
    "  quizme settings --reset-history",
    "  quizme settings --reset-profile",
    "  quizme settings --reset-why"
  ].join("\n"));

  if (args.all || args.resetHistory) {
    store.clearAll();
    console.log("Quiz history cleared.");
  }
  if (args.all || args.resetProfile) {
    store.exec("DELETE FROM profile_signals;");
    console.log("Profile signals cleared.");
  }
  if (args.all || args.resetWhy) {
    store.clearWhyThreads();
    console.log("Why threads cleared.");
  }
  if (!fs.existsSync(getAppDataDir()) && !process.env.QUIZME_DATA_DIR) {
    console.log("App data directory will be created on first write.");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`QuizMe error: ${message}`);
  process.exitCode = 1;
});
