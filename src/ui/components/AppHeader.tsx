import { Box, Text, useStdout } from "ink";
import { Divider } from "./Divider.js";
import { theme } from "../theme.js";

export function AppHeader({
  title,
  subtitle
}: {
  title: string;
  subtitle?: string;
}) {
  const { stdout } = useStdout();
  const columns = stdout.columns || 80;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.claude}>
        {title}
      </Text>
      {subtitle ? (
        <Text dimColor>{subtitle}</Text>
      ) : null}
      <Box marginTop={0}>
        <Divider width={columns} />
      </Box>
    </Box>
  );
}
