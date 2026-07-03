import { useEffect, useState } from "react";
import { Text } from "ink";
import { theme } from "../theme.js";

// Claude Code-style spinner: a pulsing dot prefix + cycling star frames.
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ label }: { label: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text>
      <Text color={theme.permission}>{FRAMES[frame]}</Text>
      <Text color={theme.claude}> {label}</Text>
    </Text>
  );
}
