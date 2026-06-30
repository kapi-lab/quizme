import crypto from "node:crypto";

const QUESTION_BANK = [
  {
    topic: "Debugging",
    question: (topic) => `When investigating ${topic}, which first step usually gives the highest signal without overcommitting to a fix?`,
    choices: [
      { id: "A", text: "Patch several layers at once so the issue disappears quickly" },
      { id: "B", text: "Reproduce the issue with the smallest concrete input and inspect the boundary that changes state" },
      { id: "C", text: "Delete failing tests until the build is green again" },
      { id: "D", text: "Refactor unrelated modules first to make the code cleaner" }
    ],
    answer: "B",
    explanation: "A tight reproduction plus boundary inspection gives fast evidence and limits accidental regressions.",
    whyWrong: {
      A: "Multiple speculative changes hide the real cause.",
      C: "It removes feedback instead of using it.",
      D: "It increases scope before the problem is understood."
    },
    tags: ["debugging", "engineering-judgment", "triage"],
    followUps: ["error classification", "minimal reproduction", "observability"]
  },
  {
    topic: "Code Review",
    question: (topic) => `In a code review related to ${topic}, which comment is usually the most valuable?`,
    choices: [
      { id: "A", text: "A style-only nit that does not affect maintainability" },
      { id: "B", text: "A specific note about a behavior change, edge case, or missing verification" },
      { id: "C", text: "A request to rewrite the whole feature from scratch" },
      { id: "D", text: "A generic statement that the code feels wrong" }
    ],
    answer: "B",
    explanation: "High-value reviews focus on correctness, risk, and missing proof rather than vague preferences.",
    whyWrong: {
      A: "Style nits are lower leverage unless they hide readability problems.",
      C: "Large rewrites without a targeted reason waste time.",
      D: "Vague feedback is hard to act on."
    },
    tags: ["code-review", "correctness", "risk"],
    followUps: ["regression testing", "review heuristics", "behavioral diffs"]
  },
  {
    topic: "Tradeoffs",
    question: (topic) => `For a feature involving ${topic}, when is an explicit tradeoff discussion most necessary?`,
    choices: [
      { id: "A", text: "When two options differ on latency, complexity, or operational risk" },
      { id: "B", text: "Only when code formatting rules disagree" },
      { id: "C", text: "Only after production incidents happen" },
      { id: "D", text: "Never; implementation speed is all that matters" }
    ],
    answer: "A",
    explanation: "Tradeoff discussion matters when choices change performance, complexity, or reliability in meaningful ways.",
    whyWrong: {
      B: "Formatting is rarely the core engineering tradeoff.",
      C: "Waiting until failure is reactive and expensive.",
      D: "Ignoring tradeoffs produces brittle systems."
    },
    tags: ["tradeoffs", "architecture", "decision-making"],
    followUps: ["latency vs complexity", "operational cost", "failure modes"]
  }
];

export function generateQuestionsLocally({ source }) {
  const topic = source.title || "the current engineering context";
  return QUESTION_BANK.map((template, index) => ({
    id: `q_${crypto.createHash("sha1").update(`${topic}:${index}`).digest("hex").slice(0, 10)}`,
    topic: template.topic,
    difficulty: 2,
    question: template.question(topic),
    choices: template.choices,
    answer: template.answer,
    explanation: template.explanation,
    whyWrong: template.whyWrong,
    tags: template.tags,
    followUps: template.followUps
  }));
}

export function generateWhyLocally({ question, asked }) {
  return [
    `Question focus: ${question.topic}`,
    `Follow-up: ${asked}`,
    question.explanation,
    `Correct option ${question.answer} is strongest because it addresses the decision boundary directly.`,
    "Use the wrong options as a checklist of common failure modes: over-scoping, weak evidence, or delayed validation."
  ].join("\n\n");
}
