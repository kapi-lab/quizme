import type { SourceSummary } from "../types.js";

export function getTopicSummary(topic: string): SourceSummary {
  return {
    sourceType: "topic",
    title: topic,
    summary: `Topic requested by user: ${topic}`
  };
}
