import { Box, Text } from "ink";
import { theme } from "../theme.js";

export function AppHeader({
  title,
  subtitle
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.claude}>
        {title}
      </Text>
      {subtitle ? (
        <Text color={theme.inactive}>{subtitle}</Text>
      ) : null}
    </Box>
  );
}
