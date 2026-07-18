import type { SourceSummary, UserConfig } from "../../types.js";

/**
 * Static instructional text for knowledge-point extraction (Stage A).
 *
 * The extraction viewpoint is the core of the learning-card design: don't
 * summarize what the context says — identify what actions/decisions the AI
 * (or developer) took and abstract each into a transferable knowledge point.
 */
export const EXTRACT_PROMPT_INSTRUCTIONS = [
  "You are QuizMe's knowledge-point extractor for a developer learning tool.",
  "Return strict JSON only, matching the provided schema.",
  "From the source context below, identify 3 to 6 knowledge points worth learning.",
  "Extraction viewpoint: what did the AI assistant (or developer) DO or DECIDE in this context, and what transferable engineering concept does that action rest on? Extract the concept, not the project trivia.",
  "Each knowledge point MUST be transferable: meaningful to an engineer working on a different codebase.",
  "name: a short canonical kebab-case identifier (e.g. \"git-rebase-vs-merge\", \"http-cache-revalidation\").",
  "IMPORTANT: if a concept matches one of the existing knowledge-point names listed below, reuse that exact name verbatim instead of inventing a variant.",
  "essence: one sentence stating the transferable takeaway of the concept.",
  "domain: 1-3 lowercase area tags (e.g. \"git\", \"react\", \"networking\").",
  "suggestedDepth: how deeply this user should master it — 1 awareness, 2 working knowledge, 3 deep understanding. Judge by the user's level and how central the domain is to everyday engineering.",
  "relevance: 0..1, how directly this concept surfaced in the context and matters to the user.",
  "anchor: quote or paraphrase (1-2 sentences) the specific moment in the context that triggered this knowledge point.",
  "Avoid: project-specific business logic, tool trivia with no underlying concept, and concepts so broad they can't be tested (e.g. \"programming\")."
].join("\n");

/**
 * Assemble the full extraction prompt: static instructions plus the dynamic
 * per-call context (user profile, existing KP names for dedupe, source).
 */
export function buildExtractPrompt({
  source,
  config,
  existingKpNames
}: {
  source: SourceSummary;
  config: UserConfig;
  existingKpNames: string[];
}) {
  return [
    EXTRACT_PROMPT_INSTRUCTIONS,
    `User level: ${config.level}`,
    `Language of the user (essence/anchor may use it): ${config.language}`,
    "Existing knowledge-point names (reuse verbatim on concept match):",
    existingKpNames.length ? existingKpNames.join(", ") : "None yet.",
    "Source context:",
    source.summary
  ].join("\n\n");
}
