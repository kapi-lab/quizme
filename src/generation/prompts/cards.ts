import type { RoundPlanItem } from "../compose.js";
import type { SourceSummary, UserConfig } from "../../types.js";

/**
 * Static instructional text for card rendering (Stage B).
 *
 * Cards are ephemeral renderings of persistent knowledge points: the plan
 * (which KP, what origin, what depth) is decided locally; the model's job is
 * to render one good multiple-choice card per plan item.
 */
export const CARDS_PROMPT_INSTRUCTIONS = [
  "You are QuizMe's card generator for a developer learning tool.",
  "Return strict JSON only, matching the provided schema.",
  "Generate exactly one multiple-choice card per knowledge point listed below, in the same order, echoing each item's kpId verbatim.",
  "Each card: exactly 4 choices (ids A, B, C, D), exactly one best answer, a `whyWrong` object with a short reason for each non-answer choice id.",
  "question MUST be an interrogative knowledge question ending with a question mark — ask why/how/what-tradeoff about the concept, never a statement, a quote of history, or a fill-in-the-blank. The choices are candidate ANSWERS to that question.",
  "Weave the scenario INTO the question text itself: open with 1-2 sentences of concrete context (when the source context below makes it natural, use THAT context — \"AI 刚才在你的项目里做了 X。为什么…？\"), then end with the actual interrogative. Do not put the scenario anywhere else.",
  "explanation MUST be a teaching paragraph of 3-6 sentences that interprets the knowledge point itself: state the underlying principle, show why the correct answer follows from it, and end with how to apply it in real engineering work. One-sentence explanations are rejected.",
  "Depth semantics — generate the question AT the item's depth:",
  "  depth 1 (awareness): what the concept is, what it's for, when to reach for it.",
  "  depth 2 (working): how to use it, how to choose between alternatives, common pitfalls.",
  "  depth 3 (deep): underlying mechanism, boundary conditions, failure modes, first-principles tradeoffs.",
  "For review items: the past question stems are listed — you MUST take a different angle from all of them. Test the same concept through a new scenario, consequence, or contrast, and re-anchor the old concept in the CURRENT context.",
  "takeaway: one sentence stating the transferable conclusion the learner should walk away with.",
  "Questions must teach, not merely quiz: clear premise, a spark of intrigue, a concrete lesson.",
  "Avoid: vague or ambiguous premises; business-logic trivia tied to one app; niche implementation details; scratch arithmetic or hand-tracing long code; frustrating difficulty."
].join("\n");

function formatPlanItem(item: RoundPlanItem, index: number): string {
  const { kp, origin, depth } = item;
  const lines = [
    `Card ${index + 1}:`,
    `  kpId: ${kp.id}`,
    `  concept: ${kp.name}`,
    `  essence: ${kp.essence}`,
    `  domain: ${kp.domain.join(", ")}`,
    `  origin: ${origin}`,
    `  depth: ${depth}`
  ];
  if (kp.recentAsks.length) {
    lines.push(
      `  past question stems (do NOT repeat these angles): ${JSON.stringify(
        kp.recentAsks.map((a) => a.question)
      )}`
    );
  }
  return lines.join("\n");
}

/**
 * Assemble the full card-rendering prompt: static instructions plus the
 * round plan and the current source context used for anchoring.
 */
export function buildCardsPrompt({
  plan,
  source,
  config
}: {
  plan: RoundPlanItem[];
  source: SourceSummary;
  config: UserConfig;
}) {
  return [
    CARDS_PROMPT_INSTRUCTIONS,
    `User level: ${config.level}`,
    `Language for questions and explanations: ${config.language}`,
    "Knowledge points to render (one card each, in order):",
    plan.map(formatPlanItem).join("\n\n"),
    "Current source context (use for anchoring):",
    source.summary
  ].join("\n\n");
}
