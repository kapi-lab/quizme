import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { SelectList } from "../components/SelectList.js";
import { StatusBar } from "../components/StatusBar.js";
import type { Language, Level, UserConfig } from "../../types.js";

const LEVELS = [
  { id: "junior", label: "Junior" },
  { id: "mid", label: "Mid" },
  { id: "senior", label: "Senior" },
  { id: "staff", label: "Staff+" }
] as const satisfies ReadonlyArray<{ id: Level; label: string }>;

export function SetupScreen({ onComplete }: { onComplete: (config: UserConfig) => void }) {
  const [step, setStep] = useState<"language" | "level">("language");
  const [language, setLanguage] = useState<Language>("en");
  const [levelIndex, setLevelIndex] = useState(1);

  useInput((input, key) => {
    if (step === "language") {
      if (input === "1") {
        setLanguage("zh-CN");
        setStep("level");
        return;
      }
      if (input === "2") {
        setLanguage("en");
        setStep("level");
        return;
      }
      if (key.return) {
        setStep("level");
      }
      return;
    }

    if (step === "level") {
      if (key.upArrow) {
        setLevelIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setLevelIndex((i) => Math.min(LEVELS.length - 1, i + 1));
        return;
      }
      const num = Number(input);
      if (num >= 1 && num <= LEVELS.length) {
        setLevelIndex(num - 1);
        return;
      }
      if (key.return) {
        onComplete({
          language,
          level: LEVELS[levelIndex].id,
          dailyGoal: 5,
          soundEnabled: false,
          createdAt: new Date().toISOString()
        });
      }
    }
  });

  const isZh = language === "zh-CN";

  if (step === "language") {
    return (
      <Box flexDirection="column">
        <Text bold>Welcome to QuizMe</Text>
        <Text>{isZh ? "选择语言:" : "Choose language:"}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>1. 中文</Text>
          <Text>2. English</Text>
        </Box>
        <StatusBar
          status={isZh ? "首次设置 · 语言" : "First run · Language"}
          hints={isZh ? "输入 1 或 2 · Enter 默认 English" : "Type 1 or 2 · Enter for English"}
        />
      </Box>
    );
  }

  const levelItems = LEVELS.map((l) => ({ id: l.id, label: l.label }));

  return (
    <Box flexDirection="column">
      <Text bold>{isZh ? "选择等级" : "Choose level"}</Text>
      <Box marginTop={1} flexDirection="column">
        <SelectList items={levelItems} selectedIndex={levelIndex} showIndex />
      </Box>
      <StatusBar
        status={isZh ? "首次设置 · 等级" : "First run · Level"}
        hints={isZh ? "↑↓ 选择 · Enter 确认 · 1-4 快捷选择" : "↑↓ select · Enter confirm · 1-4 shortcut"}
      />
    </Box>
  );
}
