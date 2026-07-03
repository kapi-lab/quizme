import { Box, Text, useStdout, useInput } from "ink";
import { symbols, theme } from "../theme.js";

export function TextInput({
  value,
  onChange,
  onSubmit,
  placeholder = "",
  frameLabel
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  frameLabel?: string;
}) {
  const { stdout } = useStdout();
  const columns = stdout.columns || 80;

  useInput((input, key) => {
    if (key.return) {
      onSubmit(value);
      return;
    }
    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }
    if (key.escape) {
      onSubmit("");
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      onChange(value + input);
    }
  });

  const prompt = placeholder || "> ";

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.promptBorder}
      marginTop={1}
      width={columns}
    >
      {frameLabel ? (
        <Text dimColor>{frameLabel}</Text>
      ) : null}
      <Box>
        <Text color={theme.permission}>{prompt}</Text>
        <Text color={theme.text}>{value}</Text>
        <Text color={theme.selectionFg}>{symbols.cursor}</Text>
      </Box>
    </Box>
  );
}
