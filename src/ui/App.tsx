import { useCallback, useEffect, useMemo, useState } from "react";
import { prefetchQuestions } from "../generation/prefetch.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { QuizScreen } from "./screens/QuizScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import { InfoScreen } from "./screens/InfoScreen.js";
import { formatProfile, formatStats } from "./formatters.js";
import { createSoundPlayer } from "./sound.js";
import { exportDebugFile } from "../debug/exportDebug.js";
import { normalizeConfig } from "../cli/config.js";
import type { HomeAction } from "./screens/HomeScreen.js";
import type { QuizMode, QuizQuestion, SourceSummary, Store, UserConfig } from "../types.js";

type AppScreen = "home" | "quiz" | "settings" | "stats" | "profile" | "review-empty";
type QuizProps = {
  source: SourceSummary;
  questionsOverride: QuizQuestion[] | null;
  mode: QuizMode;
};

export function App({
  store,
  initialConfig,
  resolveSource,
  onExit
}: {
  store: Store;
  initialConfig: UserConfig;
  resolveSource: (args: { _: string[]; repo?: string }) => SourceSummary;
  onExit: () => void;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [screen, setScreen] = useState<AppScreen>("home");
  const [quizProps, setQuizProps] = useState<QuizProps | null>(null);

  const stats = store.getStats();
  const isZh = config.language === "zh-CN";
  const sound = useMemo(() => createSoundPlayer(config), [config]);
  const homeSource = useMemo(() => {
    try {
      return resolveSource({ _: [] });
    } catch {
      return {
        sourceType: "claude_session" as const,
        title: "",
        summary: ""
      };
    }
  }, [resolveSource]);

  // Warm the question cache in the background so the next `quiz` round starts
  // instantly. Best-effort and fire-and-forget: skips when a fresh cache
  // already exists, and swallows the "no source available" case.
  const warmQuestionCache = useCallback(() => {
    try {
      prefetchQuestions({
        store,
        config,
        source: resolveSource({ _: [] }),
        mode: "mixed",
        signals: store.getProfileSignals(),
        recentQuestions: store.listRecentQuestions(20)
      });
    } catch {
      // no Claude sessions to build a source from — nothing to prefetch
    }
  }, [store, config, resolveSource]);

  // Prefetch on mount and whenever the config signature changes (a new
  // signature invalidates the old cache, so a fresh batch is generated).
  useEffect(() => {
    warmQuestionCache();
  }, [warmQuestionCache]);

  function startQuiz({
    source,
    questionsOverride = null,
    mode = "mixed"
  }: {
    source: SourceSummary;
    questionsOverride?: QuizQuestion[] | null;
    mode?: QuizMode;
  }) {
    setQuizProps({ source, questionsOverride, mode });
    setScreen("quiz");
  }

  function handleHomeAction(action: HomeAction) {
    if (action === "quiz") {
      startQuiz({ source: resolveSource({ _: [] }) });
      return;
    }
    if (action === "review") {
      const questions = store.listReviewQuestions(5);
      if (!questions.length) {
        setScreen("review-empty");
        return;
      }
      startQuiz({
        source: { sourceType: "manual", title: "review", summary: "Review incorrect questions." },
        questionsOverride: questions,
        mode: "review"
      });
      return;
    }
    if (action === "stats") {
      setScreen("stats");
      return;
    }
    if (action === "profile") {
      setScreen("profile");
      return;
    }
    if (action === "settings") {
      setScreen("settings");
      return;
    }
    if (action === "exit") {
      onExit();
    }
  }

  if (screen === "quiz" && quizProps) {
    return (
      <QuizScreen
        store={store}
        config={config}
        sound={sound}
        source={quizProps.source}
        questionsOverride={quizProps.questionsOverride}
        mode={quizProps.mode}
        // Refill the moment the round starts (cache consumed), so the next
        // batch generates during this round instead of after it — only a cold
        // start can then hit the loading screen.
        onQuestionsConsumed={warmQuestionCache}
        onDone={() => {
          setQuizProps(null);
          setScreen("home");
          // Backstop: if the consume-time refill failed (returned no batch),
          // this retries. No-op when a fresh cache already exists or is in-flight.
          warmQuestionCache();
        }}
      />
    );
  }

  if (screen === "settings") {
    const persistConfig = (next: UserConfig) => {
      store.setConfig("user", next);
      setConfig(next);
    };

    return (
      <SettingsScreen
        config={config}
        sound={sound}
        onPersist={persistConfig}
        onReset={() => {
          store.resetAll();
          setConfig(normalizeConfig({}));
          setScreen("home");
        }}
        onExportDebug={() => exportDebugFile({ config })}
        onBack={() => setScreen("home")}
      />
    );
  }

  if (screen === "stats") {
    return (
      <InfoScreen
        title={isZh ? "QuizMe 统计" : "QuizMe Stats"}
        lines={formatStats(store, isZh)}
        isZh={isZh}
        onBack={() => setScreen("home")}
      />
    );
  }

  if (screen === "profile") {
    return (
      <InfoScreen
        title={isZh ? "QuizMe 画像" : "QuizMe Profile"}
        lines={formatProfile(store, isZh)}
        isZh={isZh}
        onBack={() => setScreen("home")}
      />
    );
  }

  if (screen === "review-empty") {
    return (
      <InfoScreen
        title={isZh ? "复习" : "Review"}
        lines={[isZh ? "暂无待复习题目。" : "No pending review items."]}
        isZh={isZh}
        onBack={() => setScreen("home")}
      />
    );
  }

  return (
    <HomeScreen
      stats={stats}
      config={config}
      source={homeSource}
      sound={sound}
      onAction={handleHomeAction}
    />
  );
}
