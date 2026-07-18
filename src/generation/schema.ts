export const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    knowledgePoints: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          essence: { type: "string" },
          domain: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: { type: "string" }
          },
          suggestedDepth: { type: "integer", minimum: 1, maximum: 3 },
          relevance: { type: "number", minimum: 0, maximum: 1 },
          anchor: { type: "string" }
        },
        required: ["name", "essence", "domain", "suggestedDepth", "relevance", "anchor"]
      }
    }
  },
  required: ["knowledgePoints"]
};

const QUESTION_ITEM_SCHEMA = {
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
};

export const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: QUESTION_ITEM_SCHEMA
    }
  },
  required: ["questions"]
};

/**
 * Card schema for learning-card rounds: the question item plus card fields
 * (kpId echo, anchor, takeaway), with the batch size locked to the plan size.
 */
export function buildCardsSchema(count: number) {
  const item = JSON.parse(JSON.stringify(QUESTION_ITEM_SCHEMA)) as {
    properties: Record<string, unknown>;
    required: string[];
  };
  item.properties.kpId = { type: "string" };
  item.properties.takeaway = { type: "string" };
  item.required = [...item.required, "kpId", "takeaway"];
  return {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: item
      }
    },
    required: ["questions"]
  };
}
