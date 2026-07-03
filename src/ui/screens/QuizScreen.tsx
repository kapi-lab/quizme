import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { dedupeQuestions } from "../../generation/dedupe.js";
import { generateQuestions, generateWhy } from "../../providers/claudeAgent.js";
import { AppHeader } from "../components/AppHeader.js";
import { SelectList } from "../components/SelectList.js";
import { Spinner } from "../components/Spinner.js";
import { StatusBar } from "../components/StatusBar.js";
import { TextInput } from "../components/TextInput.js";
import { formatProfile, formatStats } from "../formatters.js";
import { hintLine, symbols, theme } from "../theme.js";
import type {
  AnswerResult,
  QuizMode,
  QuizQuestion,
  SoundPlayer,
  SourceSummary,
  Store,
  UserConfig,
  WhyMessage,
  WhyTurn
} from "../../types.js";

type Phase = "generating" | "question" | "result" | "why" | "error";
type Overlay = "stats" | "profile" | null;

export function QuizScreen({
  store,
  config,
  sound,
  source,
  questionsOverride = null,
  mode = "mixed",
  onDone
}: {
  store: Store;
  config: UserConfig;
  sound: SoundPlayer;
  source: SourceSummary;
  questionsOverride?: QuizQuestion[] | null;
  mode?: QuizMode;
  onDone: () => void;
}) {
  const isZh = config.language === "zh-CN";
  const [phase, setPhase] = useState<Phase>("generating");
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [resultActionIndex, setResultActionIndex] = useState(0);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [genElapsed, setGenElapsed] = useState(0);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [whyInput, setWhyInput] = useState("");
  const [whyMessages, setWhyMessages] = useState<WhyMessage[]>([]);
  const [whyStreaming, setWhyStreaming] = useState("");
  const [whyLoading, setWhyLoading] = useState(false);
  const whyTurnsRef = useRef<WhyTurn[]>([]);
  const startedAtRef = useRef(Date.now());
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const question = questions[questionIndex];
  const total = questions.length;

  const resultActions = isZh
    ? [
        { id: "next", label: "下一题 (Next)" },
        { id: "why", label: "深入了解 (Why)" }
      ]
    : [
        { id: "next", label: "Next" },
        { id: "why", label: "Why (deeper)" }
      ];

  useEffect(() => {
    let cancelled = false;
    const genStart = Date.now();
    const timer = setInterval(() => {
      setGenElapsed(Math.floor((Date.now() - genStart) / 1000));
    }, 1000);

    (async () => {
      try {
        store.clearQuestionBank();
        const recentQuestions = store.listRecentQuestions(20);
        let loaded;
        if (questionsOverride) {
          loaded = dedupeQuestions(questionsOverride, recentQuestions).slice(0, 5);
        } else {
          const signals = store.getProfileSignals();
          const generated = await generateQuestions({
            source,
            config,
            recentQuestions,
            mode,
            signals,
            onProgress: () => {}
          });
          loaded = dedupeQuestions(generated, recentQuestions).slice(0, 5);
        }

        if (cancelled) return;
        if (!loaded.length) {
          setError(isZh ? "去重后没有可用的新题目。" : "No fresh questions were generated after dedupe.");
          setPhase("error");
          return;
        }

        loaded.forEach((item: QuizQuestion) => store.saveQuestion(item));
        setQuestions(loaded);
        setPhase("question");
        startedAtRef.current = Date.now();
        soundRef.current.playStart();
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setPhase("error");
        }
      } finally {
        clearInterval(timer);
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [store, config, source, questionsOverride, mode, isZh]);

  function submitAnswer(selected: string) {
    if (!question) return;
    const correct = selected === question.answer;
    store.recordAttempt({
      questionId: question.id,
      selected,
      correct,
      durationMs: Date.now() - startedAtRef.current,
      tags: question.tags
    });
    question.tags.forEach((tag: string) => store.updateSignal(tag, correct));
    store.upsertReviewItem(question, correct);
    setAnswerResult({ selected, correct });
    setResultActionIndex(0);
    setPhase("result");
    if (correct) {
      soundRef.current.playCorrect();
    } else {
      soundRef.current.playIncorrect();
    }
  }

  async function submitWhyQuestion(text: string) {
    if (!question) return;
    const asked = text.trim();
    if (!asked) return;
    setWhyInput("");
    setWhyLoading(true);
    setWhyStreaming("");

    try {
      let streamed = false;
      let streamedText = "";
      const answer = await generateWhy({
        question,
        config,
        asked,
        userAnswer: answerResult?.selected ?? "none",
        onProgress: (chunk: string) => {
          streamed = true;
          streamedText += chunk;
          setWhyStreaming(streamedText);
        }
      });

      const resolved = streamed ? streamedText || answer : answer;
      setWhyMessages((prev) => [...prev, { asked, answer: resolved }]);
      whyTurnsRef.current.push({ asked, answer: resolved, at: new Date().toISOString() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setWhyMessages((prev) => [...prev, { asked, answer: `Error: ${message}` }]);
    } finally {
      setWhyLoading(false);
      setWhyStreaming("");
    }
  }

  function finishWhy() {
    if (!question) return;
    if (whyTurnsRef.current.length) {
      store.recordWhyAttempt(question.id);
    }
    whyTurnsRef.current = [];
    setWhyMessages([]);
    setWhyInput("");
    setPhase("result");
  }

  function goNextQuestion() {
    setAnswerResult(null);
    setResultActionIndex(0);
    setChoiceIndex(0);
    setWhyMessages([]);
    whyTurnsRef.current = [];

    if (questionIndex + 1 >= total) {
      soundRef.current.playComplete();
      onDone();
      return;
    }

    setQuestionIndex((i) => i + 1);
    setPhase("question");
    startedAtRef.current = Date.now();
  }

  useInput((input, key) => {
    if (!question && (phase === "question" || phase === "result" || phase === "why")) {
      return;
    }
    if (phase === "error") {
      if (key.return || input === "q") onDone();
      return;
    }

    if (overlay) {
      if (key.return || key.escape || input === "q") {
        setOverlay(null);
      }
      return;
    }

    if (phase === "generating") return;

    if (phase === "question") {
      if (input === "q" || key.escape) {
        onDone();
        return;
      }
      if (input === "s") {
        setOverlay("stats");
        return;
      }
      if (input === "p") {
        setOverlay("profile");
        return;
      }
      if (key.upArrow) {
        setChoiceIndex((i) => Math.max(0, i - 1));
        soundRef.current.playNavigate();
        return;
      }
      if (key.downArrow) {
        setChoiceIndex((i) => Math.min(question.choices.length - 1, i + 1));
        soundRef.current.playNavigate();
        return;
      }
      const num = Number(input);
      if (num >= 1 && num <= question.choices.length) {
        setChoiceIndex(num - 1);
        return;
      }
      const letter = input.toUpperCase();
      const letterIndex = question.choices.findIndex((c: { id: string }) => c.id === letter);
      if (letterIndex >= 0) {
        setChoiceIndex(letterIndex);
        return;
      }
      if (key.return) {
        submitAnswer(question.choices[choiceIndex].id);
      }
      return;
    }

      if (phase === "result") {
      if (input === "s") {
        setOverlay("stats");
        return;
      }
      if (input === "p") {
        setOverlay("profile");
        return;
      }
      if (key.upArrow) {
        setResultActionIndex((i) => Math.max(0, i - 1));
        soundRef.current.playNavigate();
        return;
      }
      if (key.downArrow) {
        setResultActionIndex((i) => Math.min(resultActions.length - 1, i + 1));
        soundRef.current.playNavigate();
        return;
      }
      if (key.return) {
        const action = resultActions[resultActionIndex].id;
        if (action === "next") {
          goNextQuestion();
        } else {
          setPhase("why");
          setWhyInput("");
        }
      }
      return;
    }

    if (phase === "why" && !whyLoading) {
      if (input === "q" || key.escape) {
        finishWhy();
      }
    }
  });

  if (phase === "error") {
    return (
      <Box flexDirection="column">
        <AppHeader title="QuizMe" subtitle={isZh ? "错误" : "Error"} />
        <Text color={theme.error}>
          {symbols.error} {error}
        </Text>
        <StatusBar
          status={isZh ? "无法继续" : "Cannot continue"}
          hints={hintLine([isZh ? "Enter 或 q 返回" : "enter or q to go back"])}
        />
      </Box>
    );
  }

  if (phase === "generating") {
    return (
      <Box flexDirection="column">
        <AppHeader title="QuizMe" subtitle={isZh ? "生成中" : "Generating"} />
        <Spinner
          label={isZh ? `正在生成题目 (${genElapsed}s)` : `Generating questions (${genElapsed}s)`}
        />
        <StatusBar
          status={isZh ? "请稍候" : "Please wait"}
          hints={hintLine([isZh ? "基于当前上下文出题" : "building questions from context"])}
        />
      </Box>
    );
  }

  if (!question) {
    return null;
  }

  const choiceItems = question.choices.map((c) => ({
    id: c.id,
    label: `${c.id}. ${c.text}`
  }));

  let statusText = "";
  let hintsText = "";

  if (overlay === "stats") {
    statusText = isZh ? "统计" : "Stats";
    hintsText = hintLine([isZh ? "Enter 关闭" : "enter close"]);
  } else if (overlay === "profile") {
    statusText = isZh ? "档案" : "Profile";
    hintsText = hintLine([isZh ? "Enter 关闭" : "enter close"]);
  } else if (phase === "question") {
    statusText = isZh
      ? `Q${questionIndex + 1}/${total} · ${question.topic}`
      : `Q${questionIndex + 1}/${total} · ${question.topic}`;
    hintsText = hintLine([
      isZh ? "↑↓ 选择" : "↑↓ select",
      isZh ? "Enter 确认" : "enter confirm",
      "A-D/1-4",
      "s stats",
      "p profile",
      "q exit"
    ]);
  } else if (phase === "result") {
    statusText = isZh ? "结果" : "Result";
    hintsText = hintLine([
      isZh ? "↑↓ 选择" : "↑↓ select",
      isZh ? "Enter 确认" : "enter confirm",
      "s stats",
      "p profile"
    ]);
  } else if (phase === "why") {
    statusText = isZh ? "Why" : "Why";
    hintsText = hintLine([
      isZh ? "Enter 发送" : "enter send",
      isZh ? "Esc 返回" : "esc back",
      "back/next"
    ]);
  }

  const quizSubtitle = isZh
    ? `第 ${questionIndex + 1}/${total} 题 · 难度 ${question.difficulty}`
    : `Question ${questionIndex + 1}/${total} · Difficulty ${question.difficulty}`;

  return (
    <Box flexDirection="column">
      <AppHeader title="QuizMe" subtitle={quizSubtitle} />
      {overlay === "stats" ? (
        <Box flexDirection="column">
          {formatStats(store).map((line, index) => (
            <Text
              key={line}
              color={index === 0 ? theme.claude : theme.text}
              bold={index === 0}
            >
              {line}
            </Text>
          ))}
        </Box>
      ) : overlay === "profile" ? (
        <Box flexDirection="column">
          {formatProfile(store).map((line, index) => (
            <Text
              key={line}
              color={index === 0 ? theme.claude : theme.text}
              bold={index === 0}
            >
              {line}
            </Text>
          ))}
        </Box>
      ) : phase === "question" ? (
        <Box flexDirection="column">
          <Text bold color={theme.claude}>
            {question.topic}
          </Text>
          <Box marginTop={1} marginBottom={1}>
            <Text color={theme.text} wrap="wrap">
              {question.question}
            </Text>
          </Box>
          <SelectList items={choiceItems} selectedIndex={choiceIndex} />
        </Box>
      ) : phase === "result" ? (
        <Box flexDirection="column">
          <Text
            bold
            color={answerResult?.correct ? theme.success : theme.error}
          >
            {answerResult?.correct
              ? isZh ? `${symbols.success} 回答正确` : `${symbols.success} Correct`
              : isZh
                ? `${symbols.error} 回答错误 · 正确答案 ${question.answer}`
                : `${symbols.error} Incorrect · Correct answer ${question.answer}`}
          </Text>
          <Box marginTop={1} marginBottom={1}>
            <Text color={theme.text} wrap="wrap">
              {question.explanation}
            </Text>
          </Box>
          {!answerResult?.correct && answerResult && question.whyWrong[answerResult.selected] ? (
            <Box marginBottom={1}>
              <Text color={theme.inactive} wrap="wrap">
                {answerResult.selected}: {question.whyWrong[answerResult.selected]}
              </Text>
            </Box>
          ) : null}
          <SelectList items={resultActions} selectedIndex={resultActionIndex} />
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text bold color={theme.permission}>
            {isZh ? "Why" : "Why"}
          </Text>
          <Box marginTop={1} flexDirection="column">
            {whyMessages.map((msg, i) => (
              <Box key={`${msg.asked}-${i}`} flexDirection="column" marginBottom={1}>
                <Text backgroundColor={theme.userMessageBg}>
                  <Text color={theme.permission}>{symbols.pointer} </Text>
                  {msg.asked}
                </Text>
                <Text color={theme.text} wrap="wrap">
                  {msg.answer}
                </Text>
              </Box>
            ))}
            {whyLoading && whyStreaming ? (
              <Text color={theme.text} wrap="wrap">
                {whyStreaming}
                <Text color={theme.selectionFg}>{symbols.cursor}</Text>
              </Text>
            ) : null}
            {whyLoading && !whyStreaming ? (
              <Spinner label={isZh ? "思考中" : "Thinking"} />
            ) : null}
          </Box>
          {!whyLoading ? (
            <TextInput
              value={whyInput}
              onChange={setWhyInput}
              onSubmit={(value) => {
                const normalized = value.trim().toLowerCase();
                if (["back", "next", "quiz"].includes(normalized)) {
                  finishWhy();
                  return;
                }
                submitWhyQuestion(value);
              }}
              placeholder="why> "
              frameLabel={isZh ? `why · 第 ${questionIndex + 1}/${total} 题` : `why · Q${questionIndex + 1}/${total}`}
            />
          ) : null}
        </Box>
      )}

      <StatusBar status={statusText} hints={hintsText} />
    </Box>
  );
}
