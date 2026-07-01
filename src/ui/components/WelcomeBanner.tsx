import { Box, Text, useStdout } from "ink";
import { Clawd } from "./Clawd.js";
import type { FeedConfig } from "./Feed.js";
import { FeedColumn } from "./FeedColumn.js";
import {
  calculateLayoutDimensions,
  calculateOptimalLeftWidth,
  getLayoutMode
} from "../logoLayout.js";
import { shortenPath, truncate } from "../textUtils.js";
import { theme } from "../theme.js";
import { QUIZME_VERSION } from "../../version.js";
import type { Stats, UserConfig } from "../../types.js";

function buildFeeds(isZh: boolean, stats: Stats): FeedConfig[] {
  const accuracy = `${(stats.accuracy * 100).toFixed(0)}%`;
  const tips: FeedConfig = {
    title: isZh ? "快速开始" : "Tips for getting started",
    lines: isZh
      ? [
          { text: "Enter 开始答题" },
          { text: "↑↓ 选择菜单项" },
          { text: "1-6 快捷跳转" }
        ]
      : [
          { text: "Press Enter to start quiz" },
          { text: "↑↓ to navigate menu" },
          { text: "1-6 for shortcuts" }
        ]
  };

  const whatsNew: FeedConfig = {
    title: isZh ? "功能概览" : "What's new",
    lines: isZh
      ? [
          { text: "Claude Code 风格 TUI 界面" },
          {
            text: `复习队列 ${stats.reviewPending} · 准确率 ${accuracy}`
          },
          { text: "docs/product.md 查看愿景" }
        ]
      : [
          { text: "Claude Code styled TUI" },
          {
            text: `Review queue ${stats.reviewPending} · accuracy ${accuracy}`
          },
          { text: "See docs/product.md for vision" }
        ]
  };

  return [tips, whatsNew];
}

export function WelcomeBanner({
  config,
  stats
}: {
  config: UserConfig;
  stats: Stats;
}) {
  const { stdout } = useStdout();
  const columns = stdout.columns || 80;
  const isZh = config.language === "zh-CN";
  const layoutMode = getLayoutMode(columns);

  const levelLabel =
    config.level === "mid"
      ? isZh
        ? "中级"
        : "mid-level"
      : config.level;
  const statusLine = isZh
    ? `${levelLabel} · ${config.language} · 每日目标 ${config.dailyGoal}`
    : `${levelLabel} · ${config.language} · daily goal ${config.dailyGoal}`;

  const titleLine = `QuizMe v${QUIZME_VERSION}`;
  const truncatedCwd = shortenPath(process.cwd(), 40);
  const optimalLeftWidth = calculateOptimalLeftWidth(
    titleLine,
    statusLine,
    truncatedCwd
  );
  const { leftWidth, rightWidth, totalWidth } = calculateLayoutDimensions(
    columns,
    layoutMode,
    optimalLeftWidth
  );

  const feeds = buildFeeds(isZh, stats);
  const boxWidth = Math.min(columns, totalWidth + 4);

  const leftPanel = (
    <Box flexDirection="row" gap={2} alignItems="center">
      <Clawd />
      <Box flexDirection="column">
        <Text>
          <Text bold>QuizMe</Text>
          <Text dimColor> v{truncate(QUIZME_VERSION, 12)}</Text>
        </Text>
        <Text dimColor>{truncate(statusLine, leftWidth - 12)}</Text>
        <Text dimColor>{truncate(truncatedCwd, leftWidth - 12)}</Text>
      </Box>
    </Box>
  );

  const rightPanel = <FeedColumn feeds={feeds} maxWidth={rightWidth} />;

  return (
    <Box flexDirection="column" marginBottom={1} width={boxWidth}>
      <Box marginBottom={-1} marginLeft={3}>
        <Text>
          <Text bold color={theme.claude}>
            QuizMe
          </Text>
          <Text dimColor> v{QUIZME_VERSION}</Text>
        </Text>
      </Box>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.claude}
        paddingX={1}
        paddingY={1}
        width={boxWidth}
      >
        {layoutMode === "horizontal" ? (
          <Box flexDirection="row" gap={1}>
            <Box width={leftWidth} justifyContent="center">
              {leftPanel}
            </Box>
            <Box
              height="100%"
              borderStyle="single"
              borderColor={theme.claude}
              borderDimColor
              borderTop={false}
              borderBottom={false}
              borderLeft={false}
            />
            {rightPanel}
          </Box>
        ) : (
          <Box flexDirection="column" gap={1} alignItems="center">
            {leftPanel}
            {rightPanel}
          </Box>
        )}
      </Box>
    </Box>
  );
}
