import { Text, useInput } from "ink";
import { theme } from "../theme.js";

export function TextInput({
  value,
  onChange,
  onSubmit,
  placeholder = ""
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
}) {
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

  return (
    <Text>
      <Text color={theme.permission}>{placeholder}</Text>
      <Text color={theme.text}>{value}</Text>
      <Text backgroundColor={theme.suggestion} color={theme.inverseText}>
        {" "}
      </Text>
    </Text>
  );
}
