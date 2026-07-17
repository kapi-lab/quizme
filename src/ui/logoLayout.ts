import { displayWidth } from "./textUtils.js";

const MAX_LEFT_WIDTH = 50;
const BORDER_PADDING = 4;
const DIVIDER_WIDTH = 1;
const CONTENT_PADDING = 2;

type LayoutMode = "horizontal" | "compact";

type LayoutDimensions = {
  leftWidth: number;
  rightWidth: number;
  totalWidth: number;
};

export function getLayoutMode(columns: number): LayoutMode {
  return columns >= 70 ? "horizontal" : "compact";
}

export function calculateLayoutDimensions(
  columns: number,
  layoutMode: LayoutMode,
  optimalLeftWidth: number
): LayoutDimensions {
  if (layoutMode === "horizontal") {
    const leftWidth = optimalLeftWidth;
    const usedSpace =
      BORDER_PADDING + CONTENT_PADDING + DIVIDER_WIDTH + leftWidth;
    const availableForRight = columns - usedSpace;

    let rightWidth = Math.max(30, availableForRight);
    const totalWidth = Math.min(
      leftWidth + rightWidth + DIVIDER_WIDTH + CONTENT_PADDING,
      columns - BORDER_PADDING
    );

    if (totalWidth < leftWidth + rightWidth + DIVIDER_WIDTH + CONTENT_PADDING) {
      rightWidth = totalWidth - leftWidth - DIVIDER_WIDTH - CONTENT_PADDING;
    }

    return { leftWidth, rightWidth, totalWidth };
  }

  const totalWidth = Math.min(columns - BORDER_PADDING, MAX_LEFT_WIDTH + 20);
  return {
    leftWidth: totalWidth,
    rightWidth: totalWidth,
    totalWidth
  };
}

export function calculateOptimalLeftWidth(...lines: string[]): number {
  const contentWidth = Math.max(...lines.map((line) => displayWidth(line)), 20);
  return Math.min(contentWidth + 4, MAX_LEFT_WIDTH);
}
