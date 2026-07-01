export const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          topic: { type: "string" },
          difficulty: { type: "integer" },
          question: { type: "string" },
          choices: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                text: { type: "string" }
              },
              required: ["id", "text"]
            }
          },
          answer: { type: "string" },
          explanation: { type: "string" },
          whyWrong: { type: "object" },
          tags: {
            type: "array",
            items: { type: "string" }
          },
          followUps: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["id", "topic", "difficulty", "question", "choices", "answer", "explanation", "whyWrong", "tags", "followUps"]
      }
    }
  },
  required: ["questions"]
};
