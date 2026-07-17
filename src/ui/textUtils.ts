/**
 * Terminal display width of a string in columns.
 *
 * A monospace terminal renders CJK / fullwidth characters (Chinese, Japanese,
 * Hangul, fullwidth punctuation, most emoji) as two columns, while
 * `String.length` counts them as one code unit. Sizing layout boxes off
 * `.length` therefore undersizes any panel containing Chinese text, which makes
 * Ink wrap lines mid-content. Measure real columns instead.
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (isZeroWidth(code)) continue;
    width += isWide(code) ? 2 : 1;
  }
  return width;
}

function isZeroWidth(code: number): boolean {
  return (
    code === 0x200b || // zero-width space
    (code >= 0x0300 && code <= 0x036f) || // combining diacritical marks
    (code >= 0xfe00 && code <= 0xfe0f) // variation selectors
  );
}

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK radicals, Kangxi, punctuation
    (code >= 0x3041 && code <= 0x33ff) || // Hiragana, Katakana, CJK symbols
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0xa000 && code <= 0xa4cf) || // Yi
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0xfe10 && code <= 0xfe19) || // Vertical forms
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK Compatibility Forms
    (code >= 0xff00 && code <= 0xff60) || // Fullwidth Forms
    (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth signs
    (code >= 0x1f300 && code <= 0x1faff) || // emoji & symbols
    (code >= 0x20000 && code <= 0x3fffd) // CJK Extension B+
  );
}

export function truncate(text: string, width: number): string {
  if (width <= 0) return "";
  if (displayWidth(text) <= width) return text;
  if (width === 1) return [...text][0] ?? "";

  let used = 0;
  let result = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const charWidth = isZeroWidth(code) ? 0 : isWide(code) ? 2 : 1;
    // Reserve one column for the ellipsis.
    if (used + charWidth > width - 1) break;
    result += char;
    used += charWidth;
  }
  return `${result}…`;
}

export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [""];
  if (displayWidth(text) <= width) return [text];

  const lines: string[] = [];
  const tokens = text.match(/\S+\s*/g) ?? [text];
  let current = "";

  for (const token of tokens) {
    const trimmed = token.trimEnd();
    const next = current ? `${current}${token}` : token;

    if (displayWidth(next.trimEnd()) <= width) {
      current = next;
      continue;
    }

    if (current.trim()) {
      lines.push(current.trimEnd());
      current = "";
    }

    if (displayWidth(trimmed) <= width) {
      current = token;
      continue;
    }

    // A single token wider than the line: break it on column boundaries.
    let part = "";
    let partWidth = 0;
    for (const char of trimmed) {
      const code = char.codePointAt(0) ?? 0;
      const charWidth = isZeroWidth(code) ? 0 : isWide(code) ? 2 : 1;
      if (partWidth + charWidth > width) {
        lines.push(part);
        part = "";
        partWidth = 0;
      }
      part += char;
      partWidth += charWidth;
    }
    current = part;
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
