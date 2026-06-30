import { useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { SelectList } from "../components/SelectList.js";
import { StatusBar } from "../components/StatusBar.js";
import type { SoundPlayer, Stats, UserConfig } from "../../types.js";

export type HomeAction = "quiz" | "review" | "stats" | "profile" | "settings" | "exit";

export function HomeScreen({
  stats,
  config,
  sound,
  onAction
}: {
  stats: Stats;
  config: UserConfig;
  sound: SoundPlayer;
  onAction: (action: HomeAction) => void;
}) {
  const isZh = config.language === "zh-CN";
  const [selectedIndex, setSelectedIndex] = useState(0);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const items: { id: HomeAction; label: string }[] = isZh
    ? [
        { id: "quiz", label: "开始答题" },
        { id: "review", label: "复习错题" },
        { id: "stats", label: "查看统计" },
        { id: "profile", label: "查看档案" },
        { id: "settings", label: "设置" },
        { id: "exit", label: "退出" }
      ]
    : [
        { id: "quiz", label: "Start Quiz" },
        { id: "review", label: "Review" },
        { id: "stats", label: "Stats" },
        { id: "profile", label: "Profile" },
        { id: "settings", label: "Settings" },
        { id: "exit", label: "Exit" }
      ];

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      soundRef.current.playNavigate();
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(items.length - 1, i + 1));
      soundRef.current.playNavigate();
      return;
    }
    if (key.return) {
      soundRef.current.playSelect();
      onAction(items[selectedIndex].id);
      return;
    }
    const num = Number(input);
    if (num >= 1 && num <= items.length) {
      soundRef.current.playSelect();
      onAction(items[num - 1].id);
    }
  });

  const streak = stats ? stats.currentStreak : 0;
  const today = stats ? stats.todayCount : 0;
  const accuracy = stats ? `${(stats.accuracy * 100).toFixed(0)}%` : "—";

  return (
    <Box flexDirection="column">
      <Text bold>=== QuizMe ===</Text>
      <Text>
        {isZh
          ? `连续: ${streak} 天  今日: ${today} 题  准确率: ${accuracy}`
          : `Streak: ${streak} days  Today: ${today}  Accuracy: ${accuracy}`}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <SelectList items={items} selectedIndex={selectedIndex} showIndex />
      </Box>
      <StatusBar
        status={isZh ? "主菜单" : "Home"}
        hints={isZh ? "↑↓ 选择 · Enter 确认 · 1-6 快捷选择" : "↑↓ select · Enter confirm · 1-6 shortcut"}
      />
    </Box>
  );
}
