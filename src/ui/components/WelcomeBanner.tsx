import { Box, Text, useStdout } from "ink";
import type { FeedConfig } from "./Feed.js";
import { FeedColumn } from "./FeedColumn.js";
import {
  calculateLayoutDimensions,
  calculateOptimalLeftWidth,
  getLayoutMode
} from "../logoLayout.js";
import { truncate, wrapText } from "../textUtils.js";
import { theme } from "../theme.js";
import { formatSourceMode } from "../formatters.js";
import { QUIZME_VERSION } from "../../version.js";
import type { SourceSummary, Stats, UserConfig } from "../../types.js";

function formatLevelLabel(level: UserConfig["level"], isZh: boolean): string {
  if (level === "mid") {
    return isZh ? "中级" : "mid-level";
  }
  return level;
}

function buildFeeds(
  isZh: boolean,
  stats: Stats,
  config: UserConfig
): FeedConfig[] {
  const accuracy = `${(stats.accuracy * 100).toFixed(0)}%`;
  const levelLabel = formatLevelLabel(config.level, isZh);

  const statsFeed: FeedConfig = {
    title: isZh ? "统计" : "Stats",
    lines: isZh
      ? [
          {
            text: `连续 ${stats.currentStreak} 天 · 最佳 ${stats.longestStreak} 天`
          },
          { text: `今日 ${stats.todayCount} 题 · 准确率 ${accuracy}` },
          { text: `复习队列 ${stats.reviewPending} · XP ${stats.xp}` }
        ]
      : [
          {
            text: `Streak ${stats.currentStreak}d · best ${stats.longestStreak}d`
          },
          { text: `Today ${stats.todayCount} · accuracy ${accuracy}` },
          { text: `Review ${stats.reviewPending} · XP ${stats.xp}` }
        ]
  };

  const configFeed: FeedConfig = {
    title: isZh ? "配置" : "Config",
    lines: isZh
      ? [
          { text: `难度 ${levelLabel}` },
          { text: `语言 ${config.language}` },
          { text: `每日目标 ${config.dailyGoal} 题` },
          { text: `音效 ${config.soundEnabled ? "开" : "关"}` }
        ]
      : [
          { text: `Level ${levelLabel}` },
          { text: `Language ${config.language}` },
          { text: `Daily goal ${config.dailyGoal}` },
          { text: `Sound ${config.soundEnabled ? "on" : "off"}` }
        ]
  };

  return [statsFeed, configFeed];
}

const CLAWD_AND_GAP = 0;

export function WelcomeBanner({
  config,
  stats,
  source
}: {
  config: UserConfig;
  stats: Stats;
  source: SourceSummary;
}) {
  const { stdout } = useStdout();
  const columns = stdout.columns || 80;
  const isZh = config.language === "zh-CN";
  const layoutMode = getLayoutMode(columns);

  const tagline = isZh
    ? "将开发上下文转化为面试风格选择题"
    : "Turn your dev context into interview-style quizzes";
  const modeLine = isZh
    ? `当前模式：${formatSourceMode(source, isZh)}`
    : `Source: ${formatSourceMode(source, isZh)}`;

  const titleLine = `QuizMe v${QUIZME_VERSION}`;

  const initialLeftWidth = calculateOptimalLeftWidth(titleLine, tagline, modeLine);
  const textWidth = Math.max(12, initialLeftWidth - CLAWD_AND_GAP);
  const taglineLines = wrapText(tagline, textWidth);
  const modeLines = wrapText(modeLine, textWidth);
  const optimalLeftWidth = calculateOptimalLeftWidth(
    titleLine,
    ...taglineLines,
    ...modeLines
  );
  const { leftWidth, rightWidth, totalWidth } = calculateLayoutDimensions(
    columns,
    layoutMode,
    optimalLeftWidth + CLAWD_AND_GAP
  );

  const feeds = buildFeeds(isZh, stats, config);
  const boxWidth = Math.min(columns, totalWidth + 4);

  const leftPanel = (
    <Box flexDirection="column">
      <Text>
        <Text bold>QuizMe</Text>
        <Text dimColor> v{truncate(QUIZME_VERSION, 12)}</Text>
      </Text>
      {taglineLines.map((line, index) => (
        <Text key={`tagline-${index}`} dimColor>
          {line}
        </Text>
      ))}
      {modeLines.map((line, index) => (
        <Text key={`mode-${index}`} dimColor>
          {line}
        </Text>
      ))}
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
        paddingY={0}
        width={boxWidth}
        borderLeft={false}
        borderRight={false}
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
