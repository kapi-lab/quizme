import { generateQuestions } from "../providers/claudeAgent.js";
import type {
  ProfileSignal,
  QuizMode,
  QuizQuestion,
  SourceSummary,
  Store,
  UserConfig
} from "../types.js";

/**
 * Background pre-generation ("prefetch") for quiz questions.
 *
 * A quiz round costs one full `claude -p` call, and the user waits on it. To
 * hide that latency we generate the next batch ahead of time — on app start
 * and after each round — and persist it via {@link Store.saveQuestionCache}.
 * The next quiz then starts from cache instantly. If the app exits before the
 * batch is played, it survives on disk and is reused next launch, so a
 * prefetch is never wasted.
 */

/**
 * Signature identifying a cached batch. A batch is only reusable while the
 * config inputs that shape question content are unchanged; when any of these
 * change (e.g. the user switches language or model) the cached batch is stale
 * and must be regenerated.
 */
export function cacheSignature(config: UserConfig, mode: QuizMode): string {
  return [
    mode,
    config.level,
    config.language,
    config.claudeModel ?? "",
    config.claudeEffort ?? ""
  ].join("|");
}

/**
 * In-flight prefetches keyed by signature. Module-level because the idle warm
 * (App) and the consuming screen (QuizScreen) live in different components but
 * share one process — this ensures they never spawn two `claude` calls for the
 * same batch. A consumer can await the pending promise instead of generating
 * its own; it resolves to `[]` on failure (never rejects).
 */
const inFlight = new Map<string, Promise<QuizQuestion[]>>();

/** The pending prefetch for `signature`, if one is running. */
export function prefetchInFlight(signature: string): Promise<QuizQuestion[]> | undefined {
  return inFlight.get(signature);
}

/**
 * Kick off a background batch and persist it to the store cache. No-op when a
 * fresh cache already exists or a prefetch for the same signature is already
 * running. Fire-and-forget: failures are swallowed (the next quiz just
 * generates live instead).
 */
export function prefetchQuestions(deps: {
  store: Store;
  config: UserConfig;
  source: SourceSummary;
  mode: QuizMode;
  signals: ProfileSignal[];
  recentQuestions: QuizQuestion[];
}): void {
  const signature = cacheSignature(deps.config, deps.mode);
  if (deps.store.hasQuestionCache(signature)) return;
  if (inFlight.has(signature)) return;

  const promise = generateQuestions({
    source: deps.source,
    config: deps.config,
    recentQuestions: deps.recentQuestions,
    mode: deps.mode,
    signals: deps.signals
  })
    .then((questions) => {
      deps.store.saveQuestionCache(questions, signature);
      return questions;
    })
    .catch(() => [] as QuizQuestion[])
    .finally(() => {
      inFlight.delete(signature);
    });

  inFlight.set(signature, promise);
}
