import { Text } from "ink";
import { theme } from "../theme.js";

export function Divider({
  width,
  color = theme.claude
}: {
  width: number;
  color?: string;
}) {
  return (
    <Text color={color} dimColor={!color}>
      {"─".repeat(Math.max(0, width))}
    </Text>
  );
}
