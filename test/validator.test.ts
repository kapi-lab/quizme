import test from "node:test";
import assert from "node:assert/strict";
import { QuestionValidationError, validateQuestions } from "../src/generation/validator.js";

const validQuestion = {
  id: "q_1",
  sourceMode: "contextual",
  topic: "React",
  difficulty: 2,
  question: "Which hook memoizes a callback?",
  choices: [
    { id: "A", text: "useEffect" },
    { id: "B", text: "useCallback" },
    { id: "C", text: "useMemo" },
    { id: "D", text: "useRef" }
  ],
  answer: "B",
  explanation: "useCallback returns a memoized version of the callback.",
  whyWrong: {
    A: "useEffect runs side effects.",
    C: "useMemo memoizes a value, not a function reference.",
    D: "useRef holds a mutable ref, not a callback."
  },
  tags: ["react", "hooks"],
};

test("accepts a well-formed question batch", () => {
  const result = validateQuestions({ questions: [validQuestion] });
  assert.equal(result.length, 1);
  assert.equal(result[0].answer, "B");
  assert.equal(result[0].sourceMode, "contextual");
});

test("rejects wrong choice count", () => {
  const bad = { ...validQuestion, choices: validQuestion.choices.slice(0, 3) };
  assert.throws(
    () => validateQuestions({ questions: [bad] }),
    QuestionValidationError
  );
});

test("rejects answer not in choices", () => {
  const bad = { ...validQuestion, answer: "E" };
  assert.throws(
    () => validateQuestions({ questions: [bad] }),
    QuestionValidationError
  );
});

test("rejects invalid sourceMode", () => {
  const bad = { ...validQuestion, sourceMode: "random" };
  assert.throws(
    () => validateQuestions({ questions: [bad] }),
    QuestionValidationError
  );
});

test("rejects empty tags", () => {
  const bad = { ...validQuestion, tags: [] };
  assert.throws(
    () => validateQuestions({ questions: [bad] }),
    QuestionValidationError
  );
});

test("rejects missing whyWrong entries", () => {
  const bad = { ...validQuestion, whyWrong: { A: "only one" } };
  assert.throws(
    () => validateQuestions({ questions: [bad] }),
    QuestionValidationError
  );
});

test("filters invalid items but keeps valid ones", () => {
  const bad = { ...validQuestion, answer: "Z" };
  const result = validateQuestions({ questions: [validQuestion, bad] });
  assert.equal(result.length, 1);
});
