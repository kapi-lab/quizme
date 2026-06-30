export function getTopicSummary(topic) {
  return {
    sourceType: "topic",
    title: topic,
    summary: `Topic requested by user: ${topic}`
  };
}
