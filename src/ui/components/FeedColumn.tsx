import { Box } from "ink";
import type { FeedConfig } from "./Feed.js";
import { calculateFeedWidth, Feed } from "./Feed.js";
import { Divider } from "./Divider.js";

export function FeedColumn({
  feeds,
  maxWidth
}: {
  feeds: FeedConfig[];
  maxWidth: number;
}) {
  const maxOfAllFeeds = Math.max(...feeds.map(calculateFeedWidth));
  const actualWidth = Math.min(maxOfAllFeeds, maxWidth);

  return (
    <Box flexDirection="column">
      {feeds.map((feed, index) => (
        <Box key={index} flexDirection="column">
          <Feed config={feed} actualWidth={actualWidth} />
          {index < feeds.length - 1 && (
            <Divider width={actualWidth} />
          )}
        </Box>
      ))}
    </Box>
  );
}
