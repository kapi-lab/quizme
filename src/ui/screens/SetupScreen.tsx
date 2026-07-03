import { useState } from "react";
import { Box, useInput } from "ink";
import { AppHeader } from "../components/AppHeader.js";
import { SelectList } from "../components/SelectList.js";
import { StatusBar } from "../components/StatusBar.js";
import { hintLine } from "../theme.js";
import type { Language, Level, UserConfig } from "../../types.js";

const LEVELS = [
  { id: "junior", label: "Junior" },
  { id: "mid", label: "Mid-level" },
  { id: "senior", label: "Senior" },
  { id: "staff", label: "Staff+" }
] as const satisfies ReadonlyArray<{ id: Level; label: string }>;

const LANGUAGES = [
  { id: "zh-CN", label: "中文" },
  { id: "en", label: "English" }
] as const satisfies ReadonlyArray<{ id: Language; label: string }>;

export function SetupScreen({ onComplete }: { onComplete: (config: UserConfig) => void }) {
  const [step, setStep] = useState<"language" | "level">("language");
  const [languageIndex, setLanguageIndex] = useState(1); // default English
  const [levelIndex, setLevelIndex] = useState(1);
  const isZh = LANGUAGES[languageIndex].id === "zh-CN";

  useInput((input, key) => {
    if (step === "language") {
      if (key.upArrow) {
        setLanguageIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setLanguageIndex((i) => Math.min(LANGUAGES.length - 1, i + 1));
        return;
      }
      const num = Number(input);
      if (num >= 1 && num <= LANGUAGES.length) {
        setLanguageIndex(num - 1);
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
          language: LANGUAGES[languageIndex].id,
          level: LEVELS[levelIndex].id,
          dailyGoal: 5,
          soundEnabled: false,
          createdAt: new Date().toISOString()
        });
      }
    }
  });

  if (step === "language") {
    const languageItems = LANGUAGES.map((l) => ({ id: l.id, label: l.label }));
    return (
      <Box flexDirection="column">
        <AppHeader
          title="QuizMe"
          subtitle={isZh ? "首次设置 · 选择语言" : "First run · Choose language"}
        />
        <Box marginTop={1} flexDirection="column">
          <SelectList items={languageItems} selectedIndex={languageIndex} showIndex />
        </Box>
        <StatusBar
          status={isZh ? "语言" : "Language"}
          hints={hintLine([
            isZh ? "↑↓ 选择" : "↑↓ select",
            isZh ? "Enter 确认" : "enter confirm",
            isZh ? "1-2 快捷" : "1-2 shortcut"
          ])}
        />
      </Box>
    );
  }

  const levelItems = LEVELS.map((l) => ({ id: l.id, label: l.label }));

  return (
    <Box flexDirection="column">
      <AppHeader
        title="QuizMe"
        subtitle={isZh ? "首次设置 · 选择等级" : "First run · Choose level"}
      />
      <Box marginTop={1} flexDirection="column">
        <SelectList items={levelItems} selectedIndex={levelIndex} showIndex />
      </Box>
      <StatusBar
        status={isZh ? "等级" : "Level"}
        hints={hintLine([
          isZh ? "↑↓ 选择" : "↑↓ select",
          isZh ? "Enter 确认" : "enter confirm",
          isZh ? "1-4 快捷" : "1-4 shortcut"
        ])}
      />
    </Box>
  );
}
