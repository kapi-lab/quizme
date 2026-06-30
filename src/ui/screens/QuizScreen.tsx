import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { dedupeQuestions } from "../../generation/dedupe.js";
import { generateQuestions, generateWhy } from "../../providers/claudeAgent.js";
import { SelectList } from "../components/SelectList.js";
import { StatusBar } from "../components/StatusBar.js";
import { TextInput } from "../components/TextInput.js";
import { formatProfile, formatStats } from "../formatters.js";
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
        const recentQuestions = store.listRecentQuestions(20);
        let loaded;
        if (questionsOverride) {
          loaded = dedupeQuestions(questionsOverride, recentQuestions).slice(0, 5);
        } else {
          const generated = await generateQuestions({
            source,
            config,
            recentQuestions,
            mode,
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

        loaded.forEach((item: QuizQuestion) => store.saveQuestion(item, source.sourceType));
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
    store.upsertReviewItem(question.id, correct);
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
      store.appendWhyThread(question.id, whyTurnsRef.current);
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
        <Text color="red">{error}</Text>
        <StatusBar
          status={isZh ? "错误" : "Error"}
          hints={isZh ? "Enter 或 q 返回" : "Enter or q to go back"}
        />
      </Box>
    );
  }

  if (phase === "generating") {
    return (
      <Box flexDirection="column">
        <Text>
          {isZh ? `正在生成题目 (${genElapsed}s)...` : `Generating questions (${genElapsed}s)...`}
        </Text>
        <StatusBar
          status={isZh ? "生成中" : "Generating"}
          hints={isZh ? "请稍候..." : "Please wait..."}
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
    statusText = isZh ? "统计 · 按 Enter 关闭" : "Stats · Press Enter to close";
    hintsText = "";
  } else if (overlay === "profile") {
    statusText = isZh ? "档案 · 按 Enter 关闭" : "Profile · Press Enter to close";
    hintsText = "";
  } else if (phase === "question") {
    statusText = isZh
      ? `答题 · Q${questionIndex + 1}/${total} · ${question.topic}`
      : `Question · Q${questionIndex + 1}/${total} · ${question.topic}`;
    hintsText = isZh
      ? "↑↓ 选择答案 · Enter 确认 · A-D/1-4 快捷 · s 统计 · p 档案 · q 退出"
      : "↑↓ select · Enter confirm · A-D/1-4 shortcut · s stats · p profile · q exit";
  } else if (phase === "result") {
    statusText = isZh ? "查看结果 · 选择下一步" : "Result · Choose next step";
    hintsText = isZh
      ? "↑↓ 选择 · Enter 确认 · s 统计 · p 档案"
      : "↑↓ select · Enter confirm · s stats · p profile";
  } else if (phase === "why") {
    statusText = isZh ? "Why 模式 · 输入追问" : "Why mode · Ask a follow-up";
    hintsText = isZh
      ? "Enter 发送 · Esc 返回 · 输入 back/next 结束"
      : "Enter to send · Esc to go back · type back/next to finish";
  }

  return (
    <Box flexDirection="column">
      {overlay === "stats" ? (
        <Box flexDirection="column">
          {formatStats(store).map((line) => (
            <Text key={line}>{line}</Text>
          ))}
        </Box>
      ) : overlay === "profile" ? (
        <Box flexDirection="column">
          {formatProfile(store).map((line) => (
            <Text key={line}>{line}</Text>
          ))}
        </Box>
      ) : phase === "question" ? (
        <Box flexDirection="column">
          <Text bold>
            Q{questionIndex + 1}/{total} · {question.topic} · Difficulty {question.difficulty}
          </Text>
          <Box marginTop={1} marginBottom={1}>
            <Text>{question.question}</Text>
          </Box>
          <SelectList items={choiceItems} selectedIndex={choiceIndex} />
        </Box>
      ) : phase === "result" ? (
        <Box flexDirection="column">
          <Text bold color={answerResult?.correct ? "green" : "red"}>
            {answerResult?.correct
              ? isZh ? "回答正确！" : "Correct."
              : isZh
                ? `回答错误。正确答案: ${question.answer}.`
                : `Incorrect. Correct answer: ${question.answer}.`}
          </Text>
          <Box marginTop={1} marginBottom={1}>
            <Text>{question.explanation}</Text>
          </Box>
          {!answerResult?.correct && answerResult && question.whyWrong[answerResult.selected] ? (
            <Box marginBottom={1}>
              <Text dimColor>
                {answerResult.selected}: {question.whyWrong[answerResult.selected]}
              </Text>
            </Box>
          ) : null}
          <SelectList items={resultActions} selectedIndex={resultActionIndex} />
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text bold>{isZh ? "Why 模式" : "Why mode"}</Text>
          <Box marginTop={1} flexDirection="column">
            {whyMessages.map((msg, i) => (
              <Box key={`${msg.asked}-${i}`} flexDirection="column" marginBottom={1}>
                <Text color="cyan">{isZh ? "问: " : "Q: "}{msg.asked}</Text>
                <Text wrap="wrap">{msg.answer}</Text>
              </Box>
            ))}
            {whyLoading && whyStreaming ? (
              <Text wrap="wrap">{whyStreaming}</Text>
            ) : null}
            {whyLoading && !whyStreaming ? (
              <Text dimColor>{isZh ? "思考中..." : "Thinking..."}</Text>
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
            />
          ) : null}
        </Box>
      )}

      <StatusBar status={statusText} hints={hintsText} />
    </Box>
  );
}
