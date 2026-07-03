/**
 * Claude Code dark theme tokens (fs5 preset).
 * Values extracted from Claude Code's built-in theme definitions.
 */
export const theme = {
  claude: "#D77757",
  clawdBody: "#D77757",
  clawdBackground: "#000000",
  text: "#FFFFFF",
  inverseText: "#000000",
  inactive: "#999999",
  subtle: "#505050",
  suggestion: "#B1B9F9",
  permission: "#B1B9F9",
  success: "#4EBA65",
  error: "#FF6B80",
  warning: "#FFC107",
  promptBorder: "#888888",
  selectionFg: "#6CB6FF",
  userMessageBg: "#373737"
} as const;

export const symbols = {
  pointer: "❯",
  pointerIdle: " ",
  success: "✓",
  error: "✘",
  cursor: "▌"
} as const;

export function hintLine(parts: string[]): string {
  return parts.filter(Boolean).join(" · ");
}
