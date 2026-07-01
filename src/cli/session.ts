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
