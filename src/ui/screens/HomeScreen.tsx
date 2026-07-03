import { useRef, useState } from "react";
import { Box, useInput } from "ink";
import { SelectList } from "../components/SelectList.js";
import { StatusBar } from "../components/StatusBar.js";
import { WelcomeBanner } from "../components/WelcomeBanner.js";
import { hintLine } from "../theme.js";
import type { SoundPlayer, SourceSummary, Stats, UserConfig } from "../../types.js";

export type HomeAction = "quiz" | "review" | "stats" | "profile" | "settings" | "exit";

export function HomeScreen({
  stats,
  config,
  source,
  sound,
  onAction
}: {
  stats: Stats;
  config: UserConfig;
  source: SourceSummary;
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
        { id: "quiz", label: "Start quiz" },
        { id: "review", label: "Review mistakes" },
        { id: "stats", label: "View stats" },
        { id: "profile", label: "View profile" },
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

  return (
    <Box flexDirection="column">
      <WelcomeBanner config={config} stats={stats} source={source} />
      <Box marginTop={1} flexDirection="column">
        <SelectList items={items} selectedIndex={selectedIndex} showIndex />
      </Box>
      <StatusBar
        status={isZh ? "主菜单" : "Home"}
        hints={hintLine([
          isZh ? "↑↓ 选择" : "↑↓ select",
          isZh ? "Enter 确认" : "enter confirm",
          isZh ? "1-6 快捷" : "1-6 shortcut"
        ])}
      />
    </Box>
  );
}
