import { extractKnowledgePoints, generateCards } from "../providers/claudeAgent.js";
import {
  demoExtractKnowledgePoints,
  demoGenerateCards,
  isLocalProvider
} from "../providers/localDemo.js";
import { interleavePlan, pickRound, planItem } from "./compose.js";
import type { RoundPlanItem } from "./compose.js";
import type {
  KnowledgePoint,
  KpAnchor,
  KpCandidate,
  QuizQuestion,
  SourceSummary,
  Store,
  UserConfig
} from "../types.js";

export interface PreparedRound {
  cards: QuizQuestion[];
  plan: RoundPlanItem[];
}

/** Round size follows the user's daily goal, clamped to a sane card count. */
function roundSize(config: UserConfig): number {
  const goal = Number(config.dailyGoal) || 5;
  return Math.min(9, Math.max(3, goal));
}

/**
 * Orchestrate one learning-card round:
 * extract KP candidates from the source, pick due reviews + new picks,
 * persist the picks, and render one card per plan item.
 *
 * Extraction failures degrade to a review-only round when reviews are due;
 * only when there is no material at all does the round fail.
 */
export async function prepareRound({
  store,
  config,
  source,
  onProgress
}: {
  store: Store;
  config: UserConfig;
  source: SourceSummary;
  onProgress?: (chunk: string) => void;
}): Promise<PreparedRound> {
  const total = roundSize(config);
  const dueKps = store.listDueKnowledgePoints();

  const local = isLocalProvider();
  let candidates: KpCandidate[] = [];
  let extractError: unknown = null;
  try {
    candidates = local
      ? demoExtractKnowledgePoints()
      : await extractKnowledgePoints({
          source,
          config,
          existingKpNames: store.listKnowledgePoints().map((kp) => kp.name),
          onProgress
        });
  } catch (err) {
    extractError = err;
  }
  if (extractError && !dueKps.length) {
    throw extractError;
  }

  const picked = pickRound({ dueKps, candidates, total });

  const anchor: KpAnchor = {
    sourceType: source.sourceType,
    title: source.title,
    at: new Date().toISOString()
  };
  const reviewIds = new Set(picked.reviews.map((kp) => kp.id));
  const fresh: KnowledgePoint[] = [];
  for (const candidate of picked.candidates) {
    const kp = store.upsertKnowledgePoint(candidate, anchor);
    // A candidate can resolve to a KP already picked for review — skip the duplicate.
    if (!reviewIds.has(kp.id) && !fresh.some((f) => f.id === kp.id)) {
      fresh.push(kp);
    }
  }

  // Candidate dedupe can shrink the round below target — backfill with the
  // remaining due KPs so a "everything is already known" day still fills up.
  const reviews = [...picked.reviews];
  const freshIds = new Set(fresh.map((kp) => kp.id));
  for (const kp of dueKps) {
    if (reviews.length + fresh.length >= total) break;
    if (!reviewIds.has(kp.id) && !freshIds.has(kp.id)) {
      reviews.push(kp);
      reviewIds.add(kp.id);
    }
  }

  const plan = interleavePlan({
    reviews: reviews.map((kp) => planItem(kp, "review")),
    // A "new" candidate that resolved to an already-asked KP is a re-encounter.
    fresh: fresh.map((kp) =>
      planItem(kp, kp.srs.lastRating === null ? "new" : "reinforce")
    )
  });

  if (!plan.length) {
    throw new Error(
      "No material for a round: extraction produced no knowledge points and nothing is due for review."
    );
  }

  const cards = local
    ? demoGenerateCards({ plan, config })
    : await generateCards({ plan, source, config, onProgress });
  return { cards, plan };
}
