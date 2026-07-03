#!/usr/bin/env node
import path from "node:path";
import { createStore } from "../storage/index.js";
import { ensureConfig } from "./config.js";
import { runQuizSession } from "./session.js";
import { getLatestClaudeSummary } from "../sources/claudeSession.js";
import { getRepoSummary } from "../sources/repository.js";
import { getTopicSummary } from "../sources/topic.js";
import { runInkHome } from "../ui/renderApp.js";
import type { SourceSummary } from "../types.js";

type CliArgs = {
  _: string[];
  repo?: string;
  help?: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--repo") {
      args.repo = argv[i + 1];
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
  `);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const store = createStore();
  const config = await ensureConfig(store);

  if (args.repo || args._.length > 0) {
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
  return getLatestClaudeSummary(process.cwd());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`QuizMe error: ${message}`);
  process.exitCode = 1;
});
