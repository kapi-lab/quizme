import { useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { AppHeader } from "../components/AppHeader.js";
import { SelectList } from "../components/SelectList.js";
import { StatusBar } from "../components/StatusBar.js";
import { hintLine, theme } from "../theme.js";
import type { Level, SoundPlayer, UserConfig } from "../../types.js";

const LEVELS = [
  { id: "junior", label: "Junior" },
  { id: "mid", label: "Mid-level" },
  { id: "senior", label: "Senior" },
  { id: "staff", label: "Staff+" }
] as const satisfies ReadonlyArray<{ id: Level; label: string }>;

export function SettingsScreen({
  config,
  sound,
  onPersist,
  onReset,
  onBack
}: {
  config: UserConfig;
  sound: SoundPlayer;
  onPersist: (config: UserConfig) => void;
  onReset: () => void;
  onBack: () => void;
}) {
  const isZh = config.language === "zh-CN";
  const [step, setStep] = useState<"menu" | "level" | "goal" | "confirm-reset">("menu");
  const [menuIndex, setMenuIndex] = useState(0);
  const [levelIndex, setLevelIndex] = useState(
    Math.max(0, LEVELS.findIndex((l) => l.id === config.level))
  );
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const configRef = useRef(config);
  configRef.current = config;

  const menuItems = isZh
    ? [
        { id: "language", label: `语言: ${config.language === "zh-CN" ? "中文" : "English"}` },
        { id: "level", label: `等级: ${config.level}` },
        { id: "goal", label: `每日目标: ${config.dailyGoal}` },
        { id: "sound", label: `音效: ${config.soundEnabled ? "开" : "关"}` },
        { id: "reset", label: "清除设置和缓存" },
        { id: "back", label: "返回" }
      ]
    : [
        { id: "language", label: `Language: ${config.language}` },
        { id: "level", label: `Level: ${config.level}` },
        { id: "goal", label: `Daily goal: ${config.dailyGoal}` },
        { id: "sound", label: `Sound: ${config.soundEnabled ? "On" : "Off"}` },
        { id: "reset", label: "Clear settings & cache" },
        { id: "back", label: "Back" }
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
        const current = configRef.current;
        if (action === "language") {
          onPersist({
            ...current,
            language: current.language === "zh-CN" ? "en" : "zh-CN"
          });
          return;
        }
        if (action === "sound") {
          const next = !current.soundEnabled;
          if (next) {
            soundRef.current.playToggleOn();
          } else {
            soundRef.current.playToggleOff();
          }
          onPersist({ ...current, soundEnabled: next });
          return;
        }
        if (action === "level") {
          setLevelIndex(Math.max(0, LEVELS.findIndex((l) => l.id === current.level)));
          setStep("level");
          return;
        }
        if (action === "goal") {
          setStep("goal");
          return;
        }
        if (action === "reset") {
          setStep("confirm-reset");
          return;
        }
        if (action === "back") {
          onBack();
        }
      }
      if (key.escape) onBack();
      return;
    }

    if (step === "confirm-reset") {
      if (input === "y" || input === "Y") {
        soundRef.current.playToggleOff();
        onReset();
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        setStep("menu");
      }
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
        onPersist({ ...configRef.current, level: LEVELS[levelIndex].id });
        setStep("menu");
      }
      if (key.escape) setStep("menu");
      return;
    }

    if (step === "goal") {
      const num = Number(input);
      if (num >= 1 && num <= 9) {
        onPersist({ ...configRef.current, dailyGoal: num });
        setStep("menu");
      }
      if (key.escape) setStep("menu");
    }
  });

  if (step === "level") {
    const levelItems = LEVELS.map((l) => ({ id: l.id, label: l.label }));
    return (
      <Box flexDirection="column">
        <AppHeader title="QuizMe" subtitle={isZh ? "设置 · 等级" : "Settings · Level"} />
        <Box marginTop={1}>
          <SelectList items={levelItems} selectedIndex={levelIndex} showIndex />
        </Box>
        <StatusBar
          status={isZh ? "等级" : "Level"}
          hints={hintLine([
            isZh ? "↑↓ 选择" : "↑↓ select",
            isZh ? "Enter 确认" : "enter confirm",
            isZh ? "Esc 返回" : "esc back"
          ])}
        />
      </Box>
    );
  }

  if (step === "goal") {
    return (
      <Box flexDirection="column">
        <AppHeader title="QuizMe" subtitle={isZh ? "设置 · 每日目标" : "Settings · Daily goal"} />
        <Box marginTop={1}>
          <Text color={theme.inactive}>{isZh ? "输入数字 1-9" : "Type a number from 1 to 9"}</Text>
        </Box>
        <StatusBar
          status={isZh ? "每日目标" : "Daily goal"}
          hints={hintLine([isZh ? "输入 1-9" : "type 1-9", isZh ? "Esc 返回" : "esc back"])}
        />
      </Box>
    );
  }

  if (step === "confirm-reset") {
    return (
      <Box flexDirection="column">
        <AppHeader
          title="QuizMe"
          subtitle={isZh ? "设置 · 清除设置和缓存" : "Settings · Clear settings & cache"}
        />
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.warning}>
            {isZh
              ? "将清除所有设置、统计、画像与复习队列，且不可恢复。"
              : "This will erase all settings, stats, profile signals, and the review queue. This cannot be undone."}
          </Text>
          <Box marginTop={1}>
            <Text color={theme.inactive}>
              {isZh ? "按 Y 确认清除，N 取消" : "Press Y to confirm, N to cancel"}
            </Text>
          </Box>
        </Box>
        <StatusBar
          status={isZh ? "确认" : "Confirm"}
          hints={hintLine([
            isZh ? "Y 确认" : "Y confirm",
            isZh ? "N/Esc 取消" : "N/esc cancel"
          ])}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <AppHeader title="QuizMe" subtitle={isZh ? "设置" : "Settings"} />
      <Box marginTop={1}>
        <SelectList items={menuItems} selectedIndex={menuIndex} />
      </Box>
      <StatusBar
        status={isZh ? "偏好" : "Preferences"}
        hints={hintLine([
          isZh ? "↑↓ 选择" : "↑↓ select",
          isZh ? "Enter 确认/切换" : "enter confirm/toggle",
          isZh ? "Esc 返回" : "esc back"
        ])}
      />
    </Box>
  );
}
