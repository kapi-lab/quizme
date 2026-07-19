import type { Choice, KpCandidate, KpDepth, QuestionSourceMode, QuizQuestion } from "../types.js";

const VALID_CHOICE_IDS: ReadonlyArray<string> = ["A", "B", "C", "D"];
const VALID_SOURCE_MODES: ReadonlyArray<QuestionSourceMode> = [
  "contextual",
  "adjacent",
  "interview_style"
];

export class QuestionValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Invalid question payload: ${issues.join("; ")}`);
    this.name = "QuestionValidationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isChoice(value: unknown): value is Choice {
  return isRecord(value)
    && typeof value.id === "string"
    && VALID_CHOICE_IDS.includes(value.id)
    && typeof value.text === "string"
    && value.text.trim().length > 0;
}

function validateOne(raw: unknown, index: number, issues: string[]): QuizQuestion | null {
  const at = `questions[${index}]`;
  if (!isRecord(raw)) {
    issues.push(`${at} is not an object`);
    return null;
  }

  const errs: string[] = [];

  if (typeof raw.id !== "string" || !raw.id.trim()) {
    errs.push(`${at}.id missing`);
  }
  if (typeof raw.topic !== "string" || !raw.topic.trim()) {
    errs.push(`${at}.topic missing`);
  }
  if (typeof raw.question !== "string" || raw.question.trim().length < 4) {
    errs.push(`${at}.question missing or too short`);
  }
  if (typeof raw.explanation !== "string" || !raw.explanation.trim()) {
    errs.push(`${at}.explanation missing`);
  }

  const sourceMode = raw.sourceMode;
  if (typeof sourceMode !== "string" || !VALID_SOURCE_MODES.includes(sourceMode as QuestionSourceMode)) {
    errs.push(`${at}.sourceMode must be one of ${VALID_SOURCE_MODES.join(", ")}`);
  }

  const difficulty = Number(raw.difficulty);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
    errs.push(`${at}.difficulty must be integer 1..5`);
  }

  const choices = raw.choices;
  if (!Array.isArray(choices) || choices.length !== 4) {
    errs.push(`${at}.choices must be exactly 4 items`);
  } else {
    const ids = new Set<string>();
    choices.forEach((choice, i) => {
      if (!isChoice(choice)) {
        errs.push(`${at}.choices[${i}] invalid`);
        return;
      }
      if (ids.has(choice.id)) {
        errs.push(`${at}.choices[${i}] duplicate id ${choice.id}`);
      }
      ids.add(choice.id);
    });
    if (VALID_CHOICE_IDS.some((id) => !ids.has(id))) {
      errs.push(`${at}.choices must include ids A, B, C, D`);
    }
  }

  const answer = raw.answer;
  if (typeof answer !== "string" || !VALID_CHOICE_IDS.includes(answer)) {
    errs.push(`${at}.answer must be one of A, B, C, D`);
  }

  const whyWrong = raw.whyWrong;
  if (!isRecord(whyWrong)) {
    errs.push(`${at}.whyWrong must be an object`);
  } else if (typeof answer === "string") {
    for (const id of VALID_CHOICE_IDS) {
      if (id === answer) continue;
      if (typeof whyWrong[id] !== "string" || !(whyWrong[id] as string).trim()) {
        errs.push(`${at}.whyWrong.${id} missing`);
      }
    }
  }

  const tags = raw.tags;
  if (!Array.isArray(tags) || tags.length === 0 || tags.some((t) => typeof t !== "string" || !t.trim())) {
    errs.push(`${at}.tags must be a non-empty array of strings`);
  }

  if (errs.length) {
    issues.push(...errs);
    return null;
  }

  const optionalStr = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;

  return {
    id: (raw.id as string).trim(),
    sourceMode: sourceMode as QuestionSourceMode,
    topic: (raw.topic as string).trim(),
    difficulty,
    question: (raw.question as string).trim(),
    choices: (choices as Choice[]).map((c) => ({ id: c.id, text: c.text.trim() })),
    answer: answer as string,
    explanation: (raw.explanation as string).trim(),
    whyWrong: whyWrong as Record<string, string>,
    tags: (tags as string[]).map((t) => t.trim()),
    // Card fields — present on learning-card rounds, absent on legacy batches.
    kpId: optionalStr(raw.kpId),
    anchor: optionalStr(raw.anchor),
    takeaway: optionalStr(raw.takeaway)
  };
}

/**
 * Validate the extraction-stage payload. Invalid candidates are dropped, not
 * fatal — extraction quality varies and the round can proceed with fewer.
 */
export function validateKpCandidates(payload: unknown): KpCandidate[] {
  if (!isRecord(payload) || !Array.isArray(payload.knowledgePoints)) {
    return [];
  }
  const out: KpCandidate[] = [];
  for (const raw of payload.knowledgePoints) {
    if (!isRecord(raw)) continue;
    if (typeof raw.name !== "string" || !raw.name.trim()) continue;
    if (typeof raw.essence !== "string" || !raw.essence.trim()) continue;
    const domain = Array.isArray(raw.domain)
      ? raw.domain.filter((d): d is string => typeof d === "string" && !!d.trim())
      : [];
    if (!domain.length) continue;
    const depthNum = Number(raw.suggestedDepth);
    const suggestedDepth: KpDepth = depthNum >= 3 ? 3 : depthNum >= 2 ? 2 : 1;
    const relevanceNum = Number(raw.relevance);
    const relevance = Number.isFinite(relevanceNum)
      ? Math.min(1, Math.max(0, relevanceNum))
      : 0.5;
    out.push({
      name: raw.name.trim(),
      essence: raw.essence.trim(),
      domain: domain.map((d) => d.trim()),
      suggestedDepth,
      relevance,
      anchor: typeof raw.anchor === "string" ? raw.anchor.trim() : ""
    });
  }
  return out;
}

export function validateQuestions(payload: unknown): QuizQuestion[] {
  if (!isRecord(payload)) {
    throw new QuestionValidationError(["payload is not an object"]);
  }
  const raw = payload.questions;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new QuestionValidationError(["questions must be a non-empty array"]);
  }

  const issues: string[] = [];
  const valid: QuizQuestion[] = [];
  raw.forEach((item, index) => {
    const q = validateOne(item, index, issues);
    if (q) valid.push(q);
  });

  if (!valid.length) {
    throw new QuestionValidationError(issues.length ? issues : ["no valid questions"]);
  }
  return valid;
}
