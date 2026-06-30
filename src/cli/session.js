import { formatProfile, formatStats } from "../ui/formatters.js";
import { runInkQuiz } from "../ui/renderApp.jsx";

export async function runQuizSession({ store, config, source, questionsOverride = null, mode = "mixed" }) {
  await runInkQuiz({
    store,
    config,
    source,
    questionsOverride,
    mode
  });
}

export function printStats(store) {
  console.log(["", ...formatStats(store)].join("\n"));
}

export function printProfile(store) {
  console.log(["", ...formatProfile(store)].join("\n"));
}
