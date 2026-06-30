import React from "react";
import { Box, Text, useInput } from "ink";
import { StatusBar } from "../components/StatusBar.jsx";

export function InfoScreen({ title, lines, isZh, onBack }) {
  useInput((input, key) => {
    if (key.return || key.escape || input === "q") {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      <Box marginTop={1} flexDirection="column">
        {lines.map((line) => (
          <Text key={line}>{line}</Text>
        ))}
      </Box>
      <StatusBar
        status={title}
        hints={isZh ? "Enter 或 q 返回主菜单" : "Enter or q to go back"}
      />
    </Box>
  );
}
