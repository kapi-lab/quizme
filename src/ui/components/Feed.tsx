import { Box, Text } from "ink";
import { displayWidth, truncate } from "../textUtils.js";
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
  /** Render numeric runs (e.g. counts, percentages) in an accent color. */
  highlightNumbers?: boolean;
};

/**
 * Split text into alternating plain and numeric segments so numbers can be
 * rendered in an accent color. A "number" is a run of digits with optional
 * decimal point and a trailing percent sign (e.g. `126`, `0.73`, `73%`).
 */
function renderHighlighted(text: string) {
  const parts = text.split(/(\d[\d.]*%?)/g);
  return parts.map((part, index) =>
    /^\d/.test(part) ? (
      <Text key={index} color={theme.selectionFg} bold>
        {part}
      </Text>
    ) : (
      <Text key={index}>{part}</Text>
    )
  );
}

type FeedProps = {
  config: FeedConfig;
  actualWidth: number;
};

export function calculateFeedWidth(config: FeedConfig): number {
  const { title, lines, footer, emptyMessage } = config;
  let maxWidth = displayWidth(title);

  if (lines.length === 0 && emptyMessage) {
    maxWidth = Math.max(maxWidth, displayWidth(emptyMessage));
  } else {
    const gap = 2;
    const maxTimestampWidth = Math.max(
      0,
      ...lines.map((line) => (line.timestamp ? displayWidth(line.timestamp) : 0))
    );
    for (const line of lines) {
      const timestampWidth = maxTimestampWidth > 0 ? maxTimestampWidth : 0;
      const lineWidth =
        displayWidth(line.text) + (timestampWidth > 0 ? timestampWidth + gap : 0);
      maxWidth = Math.max(maxWidth, lineWidth);
    }
  }

  if (footer) {
    maxWidth = Math.max(maxWidth, displayWidth(footer));
  }

  return maxWidth;
}

export function Feed({ config, actualWidth }: FeedProps) {
  const { title, lines, footer, emptyMessage, highlightNumbers } = config;
  const maxTimestampWidth = Math.max(
    0,
    ...lines.map((line) => (line.timestamp ? displayWidth(line.timestamp) : 0))
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
                {highlightNumbers ? (
                  renderHighlighted(truncate(line.text, textWidth))
                ) : (
                  <Text>{truncate(line.text, textWidth)}</Text>
                )}
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
