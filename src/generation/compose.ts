import type { CardOrigin, KnowledgePoint, KpCandidate, KpDepth } from "../types.js";

/**
 * Round composition: which knowledge points go into this round's cards.
 *
 * Local, deterministic policy — never delegated to the model:
 *   1. due reviews first, capped at half the round (forgetting curve wins,
 *      but never crowds out fresh material);
 *   2. new candidates from the current source, ranked by relevance;
 *   3. leftover quota falls back to more due reviews, then more candidates.
 * Review and new cards are interleaved so reviews don't clump at the front.
 */

export interface RoundPlanItem {
  kp: KnowledgePoint;
  origin: CardOrigin;
  /** Depth this card should be generated at. */
  depth: KpDepth;
}

export interface RoundPick {
  reviews: KnowledgePoint[];
  candidates: KpCandidate[];
}

/** Decide which due KPs and which candidates make this round. */
export function pickRound({
  dueKps,
  candidates,
  total
}: {
  dueKps: KnowledgePoint[];
  candidates: KpCandidate[];
  total: number;
}): RoundPick {
  const size = Math.max(1, total);
  const rankedCandidates = [...candidates].sort((a, b) => b.relevance - a.relevance);

  const reviewQuota = Math.min(dueKps.length, Math.ceil(size / 2));
  let newQuota = Math.min(rankedCandidates.length, size - reviewQuota);

  // Fill shortage: more reviews first (they are time-sensitive), then more candidates.
  let extraReviews = Math.min(
    dueKps.length - reviewQuota,
    size - reviewQuota - newQuota
  );
  if (extraReviews < 0) extraReviews = 0;
  const remaining = size - reviewQuota - extraReviews - newQuota;
  if (remaining > 0) {
    newQuota = Math.min(rankedCandidates.length, newQuota + remaining);
  }

  return {
    reviews: dueKps.slice(0, reviewQuota + extraReviews),
    candidates: rankedCandidates.slice(0, newQuota)
  };
}

export function planItem(kp: KnowledgePoint, origin: CardOrigin): RoundPlanItem {
  return { kp, origin, depth: kp.currentDepth };
}

/**
 * Interleave review items and fresh items into the ordered plan the card
 * generator renders from. Starts with a fresh card when available — opening
 * on new material reads better than opening on a drill.
 */
export function interleavePlan({
  reviews,
  fresh
}: {
  reviews: RoundPlanItem[];
  fresh: RoundPlanItem[];
}): RoundPlanItem[] {
  const out: RoundPlanItem[] = [];
  const max = Math.max(fresh.length, reviews.length);
  for (let i = 0; i < max; i += 1) {
    if (i < fresh.length) out.push(fresh[i]);
    if (i < reviews.length) out.push(reviews[i]);
  }
  return out;
}
