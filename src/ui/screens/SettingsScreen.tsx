import { useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { AppHeader } from "../components/AppHeader.js";
import { SelectList } from "../components/SelectList.js";
import { StatusBar } from "../components/StatusBar.js";
import { hintLine, theme } from "../theme.js";
import type { ExportResult } from "../../debug/exportDebug.js";
import type { ClaudeEffort, Level, SoundPlayer, UserConfig } from "../../types.js";

const LEVELS = [
  { id: "junior", label: "Junior" },
  { id: "mid", label: "Mid-level" },
  { id: "senior", label: "Senior" },
  { id: "staff", label: "Staff+" }
] as const satisfies ReadonlyArray<{ id: Level; label: string }>;

const CLAUDE_MODELS = [
  { id: "haiku", label: "Haiku (fast)" },
  { id: "sonnet", label: "Sonnet" },
  { id: "opus", label: "Opus" },
  { id: "", label: "Account default" }
] as const;

const CLAUDE_EFFORTS: ReadonlyArray<{ id: ClaudeEffort | ""; label: string }> = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "xHigh" },
  { id: "max", label: "Max" }
];

export function SettingsScreen({
  config,
  sound,
  onPersist,
  onReset,
  onExportDebug,
  onBack
}: {
  config: UserConfig;
  sound: SoundPlayer;
  onPersist: (config: UserConfig) => void;
  onReset: () => void;
  onExportDebug: () => ExportResult;
  onBack: () => void;
}) {
  const isZh = config.language === "zh-CN";
  const [step, setStep] = useState<
    "menu" | "level" | "goal" | "model" | "effort" | "confirm-reset" | "export-result"
  >("menu");
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [levelIndex, setLevelIndex] = useState(
    Math.max(0, LEVELS.findIndex((l) => l.id === config.level))
  );
  const [modelIndex, setModelIndex] = useState(
    Math.max(0, CLAUDE_MODELS.findIndex((m) => m.id === (config.claudeModel ?? "")))
  );
  const [effortIndex, setEffortIndex] = useState(
    Math.max(0, CLAUDE_EFFORTS.findIndex((e) => e.id === (config.claudeEffort ?? "")))
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
        {
          id: "model",
          label: `题目模型: ${config.claudeModel ? config.claudeModel : "默认"}`
        },
        {
          id: "effort",
          label: `题目 Effort: ${config.claudeEffort ?? "默认"}`
        },
        { id: "export", label: "导出调试文件" },
        { id: "reset", label: "清除设置和缓存" },
        { id: "back", label: "返回" }
      ]
    : [
        { id: "language", label: `Language: ${config.language}` },
        { id: "level", label: `Level: ${config.level}` },
        { id: "goal", label: `Daily goal: ${config.dailyGoal}` },
        { id: "sound", label: `Sound: ${config.soundEnabled ? "On" : "Off"}` },
        {
          id: "model",
          label: `Quiz model: ${config.claudeModel ? config.claudeModel : "default"}`
        },
        {
          id: "effort",
          label: `Quiz effort: ${config.claudeEffort ?? "default"}`
        },
        { id: "export", label: "Export debug file" },
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
        if (action === "model") {
          setModelIndex(
            Math.max(0, CLAUDE_MODELS.findIndex((m) => m.id === (current.claudeModel ?? "")))
          );
          setStep("model");
          return;
        }
        if (action === "effort") {
          setEffortIndex(
            Math.max(0, CLAUDE_EFFORTS.findIndex((e) => e.id === (current.claudeEffort ?? "")))
          );
          setStep("effort");
          return;
        }
        if (action === "goal") {
          setStep("goal");
          return;
        }
        if (action === "export") {
          const result = onExportDebug();
          if (result.ok) {
            soundRef.current.playSelect();
          } else {
            soundRef.current.playIncorrect();
          }
          setExportResult(result);
          setStep("export-result");
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

    if (step === "export-result") {
      if (key.return || key.escape || input === "q") {
        setExportResult(null);
        setStep("menu");
      }
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

    if (step === "model") {
      if (key.upArrow) {
        setModelIndex((i) => Math.max(0, i - 1));
        soundRef.current.playNavigate();
        return;
      }
      if (key.downArrow) {
        setModelIndex((i) => Math.min(CLAUDE_MODELS.length - 1, i + 1));
        soundRef.current.playNavigate();
        return;
      }
      if (key.return) {
        onPersist({ ...configRef.current, claudeModel: CLAUDE_MODELS[modelIndex].id });
        setStep("menu");
      }
      if (key.escape) setStep("menu");
      return;
    }

    if (step === "effort") {
      if (key.upArrow) {
        setEffortIndex((i) => Math.max(0, i - 1));
        soundRef.current.playNavigate();
        return;
      }
      if (key.downArrow) {
        setEffortIndex((i) => Math.min(CLAUDE_EFFORTS.length - 1, i + 1));
        soundRef.current.playNavigate();
        return;
      }
      if (key.return) {
        onPersist({
          ...configRef.current,
          claudeEffort: CLAUDE_EFFORTS[effortIndex].id as ClaudeEffort | undefined
        });
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

  if (step === "model") {
    const modelItems = CLAUDE_MODELS.map((m) => ({ id: m.id || "default", label: m.label }));
    return (
      <Box flexDirection="column">
        <AppHeader
          title="QuizMe"
          subtitle={isZh ? "设置 · 题目模型" : "Settings · Quiz model"}
        />
        <Box marginTop={1}>
          <SelectList items={modelItems} selectedIndex={modelIndex} showIndex />
        </Box>
        <StatusBar
          status={isZh ? "模型" : "Model"}
          hints={hintLine([
            isZh ? "↑↓ 选择" : "↑↓ select",
            isZh ? "Enter 确认" : "enter confirm",
            isZh ? "Esc 返回" : "esc back"
          ])}
        />
      </Box>
    );
  }

  if (step === "effort") {
    const effortItems = CLAUDE_EFFORTS.map((e) => ({
      id: e.id,
      label: e.label
    }));
    return (
      <Box flexDirection="column">
        <AppHeader
          title="QuizMe"
          subtitle={isZh ? "设置 · 题目 Effort" : "Settings · Quiz effort"}
        />
        <Box marginTop={1}>
          <SelectList items={effortItems} selectedIndex={effortIndex} showIndex />
        </Box>
        <StatusBar
          status={isZh ? "Effort" : "Effort"}
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

  if (step === "export-result") {
    return (
      <Box flexDirection="column">
        <AppHeader
          title="QuizMe"
          subtitle={isZh ? "设置 · 导出调试文件" : "Settings · Export debug file"}
        />
        <Box marginTop={1} flexDirection="column">
          {exportResult?.ok ? (
            <>
              <Text color={theme.claude}>
                {isZh ? "调试文件已导出：" : "Debug file exported to:"}
              </Text>
              <Box marginTop={1}>
                <Text color={theme.text}>{exportResult.path}</Text>
              </Box>
            </>
          ) : (
            <Text color={theme.warning}>
              {(isZh ? "导出失败：" : "Export failed: ") + (exportResult?.ok ? "" : exportResult?.error ?? "")}
            </Text>
          )}
        </Box>
        <StatusBar
          status={isZh ? "导出" : "Export"}
          hints={hintLine([isZh ? "Enter 或 q 返回" : "enter or q to go back"])}
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
