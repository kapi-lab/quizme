import { useMemo, useState } from "react";
import { HomeScreen } from "./screens/HomeScreen.js";
import { QuizScreen } from "./screens/QuizScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import { InfoScreen } from "./screens/InfoScreen.js";
import { formatProfile, formatStats } from "./formatters.js";
import { createSoundPlayer } from "./sound.js";
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
        onDone={() => {
          setQuizProps(null);
          setScreen("home");
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
        onBack={() => setScreen("home")}
      />
    );
  }

  if (screen === "stats") {
    return (
      <InfoScreen
        title="QuizMe Stats"
        lines={formatStats(store)}
        isZh={isZh}
        onBack={() => setScreen("home")}
      />
    );
  }

  if (screen === "profile") {
    return (
      <InfoScreen
        title="QuizMe Profile"
        lines={formatProfile(store)}
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
