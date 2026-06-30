import { Box, Text } from "ink";

export function StatusBar({ status, hints }: { status?: string; hints?: string }) {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
      {status ? <Text>{status}</Text> : null}
      {hints ? <Text dimColor>{hints}</Text> : null}
    </Box>
  );
}
