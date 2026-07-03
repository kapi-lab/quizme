import { Box, Text } from "ink";

export function StatusBar({ status, hints }: { status?: string; hints?: string }) {
  if (!status && !hints) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {status ? (
        <Text dimColor>{status}</Text>
      ) : null}
      {hints ? (
        <Text dimColor>{hints}</Text>
      ) : null}
    </Box>
  );
}
