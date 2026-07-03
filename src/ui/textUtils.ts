export function truncate(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  if (width === 1) return text.slice(0, 1);
  return `${text.slice(0, width - 1)}…`;
}

export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [""];
  if (text.length <= width) return [text];

  const lines: string[] = [];
  const tokens = text.match(/\S+\s*/g) ?? [text];
  let current = "";

  for (const token of tokens) {
    const trimmed = token.trimEnd();
    const next = current ? `${current}${token}` : token;

    if (next.trimEnd().length <= width) {
      current = next;
      continue;
    }

    if (current.trim()) {
      lines.push(current.trimEnd());
      current = "";
    }

    if (trimmed.length <= width) {
      current = token;
      continue;
    }

    for (let i = 0; i < trimmed.length; i += width) {
      const part = trimmed.slice(i, i + width);
      if (i + width >= trimmed.length) {
        current = part;
      } else {
        lines.push(part);
      }
    }
  }

  if (current.trim()) {
    lines.push(current.trimEnd());
  }

  return lines.length ? lines : [""];
}

export function shortenPath(path: string, max = 42): string {
  const home = process.env.HOME;
  const normalized = home && path.startsWith(home)
    ? `~${path.slice(home.length)}`
    : path;
  return truncate(normalized, max);
}
