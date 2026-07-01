export function truncate(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  if (width === 1) return text.slice(0, 1);
  return `${text.slice(0, width - 1)}…`;
}

export function shortenPath(path: string, max = 42): string {
  const home = process.env.HOME;
  const normalized = home && path.startsWith(home)
    ? `~${path.slice(home.length)}`
    : path;
  return truncate(normalized, max);
}
