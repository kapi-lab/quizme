import { formatProfile, formatStats } from "../ui/formatters.js";
import { runInkQuiz } from "../ui/renderApp.js";
import type { QuizMode, QuizQuestion, SourceSummary, Store, UserConfig } from "../types.js";

export async function runQuizSession({
  store,
  config,
  source,
  questionsOverride = null,
  mode = "mixed"
}: {
  store: Store;
  config: UserConfig;
  source: SourceSummary;
  questionsOverride?: QuizQuestion[] | null;
  mode?: QuizMode;
}) {
  await runInkQuiz({
    store,
    config,
    source,
    questionsOverride,
    mode
  });
}

export function printStats(store: Store) {
  console.log(["", ...formatStats(store)].join("\n"));
}

export function printProfile(store: Store) {
  console.log(["", ...formatProfile(store)].join("\n"));
}
