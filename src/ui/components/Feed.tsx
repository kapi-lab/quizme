import { Box, Text } from "ink";
import { truncate } from "../textUtils.js";
import { theme } from "../theme.js";

export type FeedLine = {
  text: string;
  timestamp?: string;
};

export type FeedConfig = {
  title: string;
  lines: FeedLine[];
  footer?: string;
  emptyMessage?: string;
};

type FeedProps = {
  config: FeedConfig;
  actualWidth: number;
};

export function calculateFeedWidth(config: FeedConfig): number {
  const { title, lines, footer, emptyMessage } = config;
  let maxWidth = title.length;

  if (lines.length === 0 && emptyMessage) {
    maxWidth = Math.max(maxWidth, emptyMessage.length);
  } else {
    const gap = 2;
    const maxTimestampWidth = Math.max(
      0,
      ...lines.map((line) => (line.timestamp ? line.timestamp.length : 0))
    );
    for (const line of lines) {
      const timestampWidth = maxTimestampWidth > 0 ? maxTimestampWidth : 0;
      const lineWidth =
        line.text.length + (timestampWidth > 0 ? timestampWidth + gap : 0);
      maxWidth = Math.max(maxWidth, lineWidth);
    }
  }

  if (footer) {
    maxWidth = Math.max(maxWidth, footer.length);
  }

  return maxWidth;
}

export function Feed({ config, actualWidth }: FeedProps) {
  const { title, lines, footer, emptyMessage } = config;
  const maxTimestampWidth = Math.max(
    0,
    ...lines.map((line) => (line.timestamp ? line.timestamp.length : 0))
  );

  return (
    <Box flexDirection="column" width={actualWidth}>
      <Text bold color={theme.claude}>
        {title}
      </Text>
      {lines.length === 0 && emptyMessage ? (
        <Text dimColor>{truncate(emptyMessage, actualWidth)}</Text>
      ) : (
        <>
          {lines.map((line, index) => {
            const textWidth = Math.max(
              10,
              actualWidth - (maxTimestampWidth > 0 ? maxTimestampWidth + 2 : 0)
            );
            return (
              <Text key={index}>
                {maxTimestampWidth > 0 && (
                  <>
                    <Text dimColor>
                      {(line.timestamp || "").padEnd(maxTimestampWidth)}
                    </Text>
                    {"  "}
                  </>
                )}
                <Text>{truncate(line.text, textWidth)}</Text>
              </Text>
            );
          })}
          {footer && (
            <Text dimColor italic>
              {truncate(footer, actualWidth)}
            </Text>
          )}
        </>
      )}
    </Box>
  );
}
