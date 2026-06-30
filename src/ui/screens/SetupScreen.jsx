import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { SelectList } from "../components/SelectList.jsx";
import { StatusBar } from "../components/StatusBar.jsx";

const LEVELS = [
  { id: "junior", label: "Junior" },
  { id: "mid", label: "Mid" },
  { id: "senior", label: "Senior" },
  { id: "staff", label: "Staff+" }
];

export function SetupScreen({ onComplete }) {
  const [step, setStep] = useState("language");
  const [language, setLanguage] = useState("en");
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
