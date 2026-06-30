import React, { useMemo, useState } from "react";
import { HomeScreen } from "./screens/HomeScreen.jsx";
import { QuizScreen } from "./screens/QuizScreen.jsx";
import { SettingsScreen } from "./screens/SettingsScreen.jsx";
import { InfoScreen } from "./screens/InfoScreen.jsx";
import { formatProfile, formatStats } from "./formatters.js";
import { createSoundPlayer } from "./sound.js";

export function App({
  store,
  initialConfig,
  resolveSource,
  onExit
}) {
  const [config, setConfig] = useState(initialConfig);
  const [screen, setScreen] = useState("home");
  const [quizProps, setQuizProps] = useState(null);

  const stats = store.getStats();
  const isZh = config.language === "zh-CN";
  const sound = useMemo(() => createSoundPlayer(config), [config]);

  function startQuiz({ source, questionsOverride = null, mode = "mixed" }) {
    setQuizProps({ source, questionsOverride, mode });
    setScreen("quiz");
  }

  function handleHomeAction(action) {
    if (action === "quiz") {
      startQuiz({ source: resolveSource({}) });
      return;
    }
    if (action === "review") {
      const ids = new Set(store.listReviewQuestionIds(5));
      const questions = store.listRecentQuestions(50).filter((item) => ids.has(item.id));
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
    return (
      <SettingsScreen
        config={config}
        sound={sound}
        onSave={(next) => {
          store.setConfig("user", next);
          setConfig(next);
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
      sound={sound}
      onAction={handleHomeAction}
    />
  );
}
