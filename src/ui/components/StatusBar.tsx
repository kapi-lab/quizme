import { Box, Text } from "ink";
import { theme } from "../theme.js";

export function StatusBar({ status, hints }: { status?: string; hints?: string }) {
  if (!status && !hints) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {status ? (
        <Text color={theme.inactive}>{status}</Text>
      ) : null}
      {hints ? (
        <Text color={theme.subtle}>{hints}</Text>
      ) : null}
    </Box>
  );
}
