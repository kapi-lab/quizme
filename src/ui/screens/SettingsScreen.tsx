import { useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { SelectList } from "../components/SelectList.js";
import { StatusBar } from "../components/StatusBar.js";
import type { Level, SoundPlayer, UserConfig } from "../../types.js";

const LEVELS = [
  { id: "junior", label: "Junior" },
  { id: "mid", label: "Mid" },
  { id: "senior", label: "Senior" },
  { id: "staff", label: "Staff+" }
] as const satisfies ReadonlyArray<{ id: Level; label: string }>;

export function SettingsScreen({
  config,
  sound,
  onSave,
  onBack
}: {
  config: UserConfig;
  sound: SoundPlayer;
  onSave: (config: UserConfig) => void;
  onBack: () => void;
}) {
  const isZh = config.language === "zh-CN";
  const [step, setStep] = useState<"menu" | "level" | "goal">("menu");
  const [draft, setDraft] = useState({ ...config });
  const [menuIndex, setMenuIndex] = useState(0);
  const [levelIndex, setLevelIndex] = useState(
    Math.max(0, LEVELS.findIndex((l) => l.id === config.level))
  );
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const menuItems = isZh
    ? [
        { id: "language", label: `语言: ${draft.language === "zh-CN" ? "中文" : "English"}` },
        { id: "level", label: `等级: ${draft.level}` },
        { id: "goal", label: `每日目标: ${draft.dailyGoal}` },
        { id: "sound", label: `音效: ${draft.soundEnabled ? "开" : "关"}` },
        { id: "save", label: "保存并返回" },
        { id: "back", label: "取消" }
      ]
    : [
        { id: "language", label: `Language: ${draft.language}` },
        { id: "level", label: `Level: ${draft.level}` },
        { id: "goal", label: `Daily goal: ${draft.dailyGoal}` },
        { id: "sound", label: `Sound: ${draft.soundEnabled ? "On" : "Off"}` },
        { id: "save", label: "Save and back" },
        { id: "back", label: "Cancel" }
      ];

  useInput((input, key) => {
    if (step === "menu") {
      if (key.upArrow) {
        setMenuIndex((i) => Math.max(0, i - 1));
        soundRef.current.playNavigate();
        return;
      }
      if (key.downArrow) {
        setMenuIndex((i) => Math.min(menuItems.length - 1, i + 1));
        soundRef.current.playNavigate();
        return;
      }
      if (key.return) {
        const action = menuItems[menuIndex].id;
        if (action === "language") {
          setDraft((d) => ({
            ...d,
            language: d.language === "zh-CN" ? "en" : "zh-CN"
          }));
          return;
        }
        if (action === "sound") {
          setDraft((d) => {
            const next = !d.soundEnabled;
            if (next) {
              soundRef.current.playToggleOn();
            } else {
              soundRef.current.playToggleOff();
            }
            return { ...d, soundEnabled: next };
          });
          return;
        }
        if (action === "level") {
          setStep("level");
          return;
        }
        if (action === "goal") {
          setStep("goal");
          return;
        }
        if (action === "save") {
          onSave(draft);
          return;
        }
        if (action === "back") {
          onBack();
        }
      }
      if (key.escape) onBack();
      return;
    }

    if (step === "level") {
      if (key.upArrow) {
        setLevelIndex((i) => Math.max(0, i - 1));
        soundRef.current.playNavigate();
        return;
      }
      if (key.downArrow) {
        setLevelIndex((i) => Math.min(LEVELS.length - 1, i + 1));
        soundRef.current.playNavigate();
        return;
      }
      if (key.return) {
        setDraft((d) => ({ ...d, level: LEVELS[levelIndex].id }));
        setStep("menu");
      }
      if (key.escape) setStep("menu");
      return;
    }

    if (step === "goal") {
      const num = Number(input);
      if (num >= 1 && num <= 9) {
        setDraft((d) => ({ ...d, dailyGoal: num }));
        setStep("menu");
      }
      if (key.escape) setStep("menu");
    }
  });

  if (step === "level") {
    const levelItems = LEVELS.map((l) => ({ id: l.id, label: l.label }));
    return (
      <Box flexDirection="column">
        <Text bold>{isZh ? "选择等级" : "Choose level"}</Text>
        <Box marginTop={1}>
          <SelectList items={levelItems} selectedIndex={levelIndex} showIndex />
        </Box>
        <StatusBar
          status={isZh ? "设置 · 等级" : "Settings · Level"}
          hints={isZh ? "↑↓ 选择 · Enter 确认 · Esc 返回" : "↑↓ select · Enter confirm · Esc back"}
        />
      </Box>
    );
  }

  if (step === "goal") {
    return (
      <Box flexDirection="column">
        <Text bold>{isZh ? "每日目标 (1-9)" : "Daily goal (1-9)"}</Text>
        <Text dimColor>{isZh ? "输入数字 1-9" : "Type a number 1-9"}</Text>
        <StatusBar
          status={isZh ? "设置 · 每日目标" : "Settings · Daily goal"}
          hints={isZh ? "输入 1-9 · Esc 返回" : "Type 1-9 · Esc back"}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>{isZh ? "=== 设置 ===" : "=== Settings ==="}</Text>
      <Box marginTop={1}>
        <SelectList items={menuItems} selectedIndex={menuIndex} />
      </Box>
      <StatusBar
        status={isZh ? "设置" : "Settings"}
        hints={isZh ? "↑↓ 选择 · Enter 确认/切换 · Esc 返回" : "↑↓ select · Enter confirm/toggle · Esc back"}
      />
    </Box>
  );
}
