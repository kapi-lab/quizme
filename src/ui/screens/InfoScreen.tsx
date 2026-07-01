import { Box, Text, useInput } from "ink";
import { AppHeader } from "../components/AppHeader.js";
import { StatusBar } from "../components/StatusBar.js";
import { hintLine, theme } from "../theme.js";

export function InfoScreen({
  title,
  lines,
  isZh,
  onBack
}: {
  title: string;
  lines: string[];
  isZh: boolean;
  onBack: () => void;
}) {
  useInput((input, key) => {
    if (key.return || key.escape || input === "q") {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <AppHeader title="QuizMe" subtitle={title} />
      <Box marginTop={1} flexDirection="column">
        {lines.map((line, index) => {
          const isHeading = index === 0 || line.endsWith(":") || line === "";
          return (
            <Text
              key={`${line}-${index}`}
              color={isHeading && line ? theme.claude : theme.text}
              bold={isHeading && line !== ""}
            >
              {line || " "}
            </Text>
          );
        })}
      </Box>
      <StatusBar
        status={title}
        hints={hintLine([isZh ? "Enter 或 q 返回" : "enter or q to go back"])}
      />
    </Box>
  );
}
