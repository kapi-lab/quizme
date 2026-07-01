#!/usr/bin/env -S node --import tsx
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createStore } from "../storage/index.js";
import { ensureConfig, isValidLanguage, isValidLevel, normalizeConfig } from "./config.js";
import { runQuizSession, printProfile, printStats } from "./session.js";
import { getLatestClaudeSummary, inspectClaudeSessions } from "../sources/claudeSession.js";
import { getRepoSummary } from "../sources/repository.js";
import { getTopicSummary } from "../sources/topic.js";
import { getAppDataDir } from "../platform/paths.js";
import { runInkHome } from "../ui/renderApp.js";
import type { ProfilePreferenceKind, QuizQuestion, SourceSummary, Store, UserConfig } from "../types.js";

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
  resetQuestions?: boolean;
  all?: boolean;
  yes?: boolean;
  prefer?: string;
  suppress?: string;
  markKnown?: string;
  removePref?: string;
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
    } else if (token === "--reset-questions") {
      args.resetQuestions = true;
    } else if (token === "--all") {
      args.all = true;
    } else if (token === "--yes" || token === "-y") {
      args.yes = true;
    } else if (token === "--prefer") {
      args.prefer = argv[i + 1];
      i += 1;
    } else if (token === "--suppress") {
      args.suppress = argv[i + 1];
      i += 1;
    } else if (token === "--mark-known") {
      args.markKnown = argv[i + 1];
      i += 1;
    } else if (token === "--remove-pref") {
      args.removePref = argv[i + 1];
      i += 1;
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
  quizme settings --prefer <tag>       # weight tag up
  quizme settings --suppress <tag>     # weight tag down
  quizme settings --mark-known <tag>   # user already knows this tag
  quizme settings --remove-pref <tag>
  quizme settings --reset-history     # delete attempts + review queue
  quizme settings --reset-profile     # delete signals + preferences
  quizme settings --reset-why         # delete why threads
  quizme settings --reset-questions   # delete cached question bank
  quizme settings --all               # wipe every table
  quizme settings ... --yes           # skip confirmation
  quizme review
  quizme inspect-sources
  quizme inspect-sources --session /path/to/session.jsonl
  `);
}

async function confirm(message: string, skip: boolean): Promise<boolean> {
  if (skip) return true;
  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question(`${message} Type "yes" to continue: `)).trim().toLowerCase();
    return answer === "yes" || answer === "y";
  } finally {
    rl.close();
  }
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

  const prefKindMap: Array<{ arg?: string; kind: ProfilePreferenceKind }> = [
    { arg: args.prefer, kind: "boost" },
    { arg: args.suppress, kind: "suppress" },
    { arg: args.markKnown, kind: "known" }
  ];
  for (const { arg, kind } of prefKindMap) {
    if (arg) {
      const tag = arg.trim();
      if (!tag) throw new Error("Preference tag cannot be empty.");
      store.upsertProfilePreference({ tag, kind });
      console.log(`Preference saved: ${tag} → ${kind}`);
    }
  }
  if (args.removePref) {
    store.deleteProfilePreference(args.removePref.trim());
    console.log(`Preference removed: ${args.removePref}`);
  }

  const user = normalizeConfig(store.getConfig("user", current) ?? undefined);
  const prefs = store.listProfilePreferences();
  console.log([
    `App data dir: ${getAppDataDir()}`,
    `Language: ${user.language}`,
    `Level: ${user.level}`,
    `Daily goal: ${user.dailyGoal}`,
    "",
    "Preferences:",
    prefs.length
      ? prefs.map((p) => `  ${p.tag} → ${p.kind}`).join("\n")
      : "  (none)",
    "",
    "Use one of:",
    "  quizme settings --language zh-CN",
    "  quizme settings --level senior",
    "  quizme settings --daily-goal 8",
    "  quizme settings --prefer react",
    "  quizme settings --suppress css-trivia",
    "  quizme settings --mark-known git-basics",
    "  quizme settings --remove-pref react",
    "  quizme settings --reset-history      (deletes attempts + review queue)",
    "  quizme settings --reset-profile      (deletes profile signals + preferences)",
    "  quizme settings --reset-why          (deletes why threads)",
    "  quizme settings --reset-questions    (deletes cached question bank)",
    "  quizme settings --all                (wipes ALL local data)"
  ].join("\n"));

  const skipConfirm = args.yes === true;

  if (args.all) {
    const ok = await confirm(
      "This will DELETE all attempts, questions, profile signals, preferences, why threads, review items, and game progress.",
      skipConfirm
    );
    if (!ok) {
      console.log("Aborted.");
      return;
    }
    store.clearAll();
    console.log("All QuizMe local data cleared.");
    return;
  }

  if (args.resetHistory) {
    const ok = await confirm(
      "This will DELETE all attempts and the review queue. Profile signals, preferences, and cached questions are kept.",
      skipConfirm
    );
    if (!ok) {
      console.log("Aborted history reset.");
    } else {
      store.clearAttemptHistory();
      console.log("Attempt history and review queue cleared.");
    }
  }

  if (args.resetProfile) {
    const ok = await confirm(
      "This will DELETE profile signals and preferences. Answer history is kept.",
      skipConfirm
    );
    if (!ok) {
      console.log("Aborted profile reset.");
    } else {
      store.clearProfileSignals();
      store.clearProfilePreferences();
      console.log("Profile signals and preferences cleared.");
    }
  }

  if (args.resetWhy) {
    const ok = await confirm("This will DELETE all why threads.", skipConfirm);
    if (!ok) {
      console.log("Aborted why reset.");
    } else {
      store.clearWhyThreads();
      console.log("Why threads cleared.");
    }
  }

  if (args.resetQuestions) {
    const ok = await confirm(
      "This will DELETE the cached question bank. Attempts referencing these questions remain but their payloads will be gone.",
      skipConfirm
    );
    if (!ok) {
      console.log("Aborted question bank reset.");
    } else {
      store.clearQuestionBank();
      console.log("Question bank cleared.");
    }
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
