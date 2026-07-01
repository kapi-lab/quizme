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
          sourceMode: {
            type: "string",
            enum: ["contextual", "adjacent", "interview_style"]
          },
          topic: { type: "string" },
          difficulty: { type: "integer", minimum: 1, maximum: 5 },
          question: { type: "string" },
          choices: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              properties: {
                id: { type: "string", enum: ["A", "B", "C", "D"] },
                text: { type: "string" }
              },
              required: ["id", "text"]
            }
          },
          answer: { type: "string", enum: ["A", "B", "C", "D"] },
          explanation: { type: "string" },
          whyWrong: { type: "object" },
          tags: {
            type: "array",
            minItems: 1,
            items: { type: "string" }
          },
          followUps: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["id", "sourceMode", "topic", "difficulty", "question", "choices", "answer", "explanation", "whyWrong", "tags", "followUps"]
      }
    }
  },
  required: ["questions"]
};
