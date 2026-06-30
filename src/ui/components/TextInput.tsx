import { Text, useInput } from "ink";

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
      {placeholder}
      {value}
      <Text inverse> </Text>
    </Text>
  );
}
