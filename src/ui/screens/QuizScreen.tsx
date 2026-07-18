import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { dedupeQuestions } from "../../generation/dedupe.js";
import { prepareRound } from "../../generation/round.js";
import { generateWhy } from "../../providers/claudeAgent.js";
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
  Rating,
  SoundPlayer,
  SourceSummary,
  Store,
  UserConfig,
  WhyMessage,
  WhyTurn
} from "../../types.js";

type Phase = "generating" | "question" | "result" | "why" | "summary" | "error";
type Overlay = "stats" | "profile" | null;

/** Per-card outcome collected for the end-of-round summary. */
interface CardOutcome {
  origin: QuizQuestion["origin"];
  kpName: string | null;
  correct: boolean;
  skipped: boolean;
  /** Interval after rating, in days — null when the card has no KP. */
  intervalDays: number | null;
  lapsed: boolean;
}

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
  const outcomesRef = useRef<CardOutcome[]>([]);
  const startedAtRef = useRef(Date.now());
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const question = questions[questionIndex];
  const total = questions.length;

  const resultActions = isZh
    ? [{ id: "next", label: "下一题 (Next)" }]
    : [{ id: "next", label: "Next" }];

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
          const { cards } = await prepareRound({
            store,
            config,
            source,
            onProgress: () => {}
          });
          loaded = dedupeQuestions(cards, recentQuestions);
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

  function submitAnswer(selected: string, skipped = false) {
    if (!question) return;
    const correct = !skipped && selected === question.answer;
    store.recordAttempt({
      questionId: question.id,
      selected,
      correct,
      durationMs: Date.now() - startedAtRef.current,
      tags: question.tags
    });
    question.tags.forEach((tag: string) => store.updateSignal(tag, correct));
    store.upsertReviewItem(question, correct);

    let intervalDays: number | null = null;
    let lapsed = false;
    let kpName: string | null = null;
    if (question.kpId) {
      const rating: Rating = correct ? "good" : "again";
      const kp = store.rateKnowledgePoint(question.kpId, rating, question.question);
      if (kp) {
        intervalDays = kp.srs.intervalDays;
        lapsed = rating === "again";
        kpName = kp.name;
      }
    }
    outcomesRef.current.push({
      origin: question.origin,
      kpName,
      correct,
      skipped,
      intervalDays,
      lapsed
    });

    setAnswerResult({ selected, correct, skipped });
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
      setPhase("summary");
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

    if (phase === "summary") {
      if (key.return || input === "q") onDone();
      return;
    }

    if (phase === "question") {
      if (input === "q" || key.escape) {
        onDone();
        return;
      }
      if (input === "s") {
        // "Not sure" — reveal the answer and learn; scheduled as a lapse.
        submitAnswer("?", true);
        return;
      }
      if (input === "t") {
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
      if (input === "t") {
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

  const originBadge = question.origin
    ? question.origin === "review"
      ? isZh ? `↻ 复习：${question.topic}` : `↻ Review: ${question.topic}`
      : question.origin === "reinforce"
        ? isZh ? `⚑ 巩固：${question.topic}` : `⚑ Reinforce: ${question.topic}`
        : isZh ? `✦ 新知识：${question.topic}` : `✦ New: ${question.topic}`
    : question.topic;

  const outcomes = outcomesRef.current;
  const correctCount = outcomes.filter((o) => o.correct).length;
  const wrongCount = outcomes.filter((o) => !o.correct && !o.skipped).length;
  const skippedCount = outcomes.filter((o) => o.skipped).length;
  const newNames = outcomes
    .filter((o) => (o.origin === "new" || o.origin === "reinforce") && o.kpName)
    .map((o) => o.kpName as string);
  const reviewOutcomes = outcomes.filter((o) => o.origin === "review");
  const extendedCount = reviewOutcomes.filter((o) => !o.lapsed).length;
  const relapsedCount = reviewOutcomes.filter((o) => o.lapsed).length;
  const dueTomorrow = store
    .listDueKnowledgePoints(new Date(Date.now() + 86_400_000))
    .length;
  const summaryLines = isZh
    ? [
        `本轮 ${outcomes.length} 张 · ${symbols.success}${correctCount} ${symbols.error}${wrongCount}${skippedCount ? ` · 跳过 ${skippedCount}` : ""}`,
        ...(newNames.length ? [`✦ 新增知识点 ${newNames.length} 个：${newNames.join("、")}`] : []),
        ...(reviewOutcomes.length
          ? [`↻ 复习结果：${extendedCount} 个间隔延长、${relapsedCount} 个回炉（明天再见）`]
          : []),
        `未来 24 小时内到期 ${dueTomorrow} 个知识点`
      ]
    : [
        `Round of ${outcomes.length} · ${symbols.success}${correctCount} ${symbols.error}${wrongCount}${skippedCount ? ` · skipped ${skippedCount}` : ""}`,
        ...(newNames.length ? [`✦ New knowledge points (${newNames.length}): ${newNames.join(", ")}`] : []),
        ...(reviewOutcomes.length
          ? [`↻ Reviews: ${extendedCount} intervals extended, ${relapsedCount} back to tomorrow`]
          : []),
        `${dueTomorrow} knowledge points due within 24h`
      ];

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
      isZh ? "s 不确定" : "s not sure",
      "t stats",
      "p profile",
      "q exit"
    ]);
  } else if (phase === "result") {
    statusText = isZh ? "结果" : "Result";
    hintsText = hintLine([
      isZh ? "↑↓ 选择" : "↑↓ select",
      isZh ? "Enter 确认" : "enter confirm",
      "t stats",
      "p profile"
    ]);
  } else if (phase === "summary") {
    statusText = isZh ? "本轮小结" : "Round summary";
    hintsText = hintLine([isZh ? "Enter 或 q 结束" : "enter or q to finish"]);
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
            {originBadge}
          </Text>
          <Box marginTop={1} marginBottom={1}>
            <Text bold color={theme.text} wrap="wrap">
              {`Q: ${question.question}`}
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
              : answerResult?.skipped
                ? isZh
                  ? `${symbols.pointer} 不确定 · 正确答案 ${question.answer}`
                  : `${symbols.pointer} Not sure · Correct answer ${question.answer}`
                : isZh
                  ? `${symbols.error} 回答错误 · 正确答案 ${question.answer}`
                  : `${symbols.error} Incorrect · Correct answer ${question.answer}`}
          </Text>
          {!answerResult?.correct && !answerResult?.skipped && answerResult && question.whyWrong[answerResult.selected] ? (
            <Box marginTop={1}>
              <Text color={theme.text} wrap="wrap">
                <Text bold>{isZh ? `${answerResult.selected} 为什么不对：` : `Why ${answerResult.selected} is wrong: `}</Text>
                {question.whyWrong[answerResult.selected]}
              </Text>
            </Box>
          ) : null}
          <Box marginTop={1} marginBottom={1} flexDirection="column">
            <Text bold color={theme.text}>
              {isZh ? "解读" : "Explanation"}
            </Text>
            <Text color={theme.text} wrap="wrap">
              {question.explanation}
            </Text>
          </Box>
          {question.takeaway ? (
            <Box marginBottom={1}>
              <Text color={theme.claude} wrap="wrap">
                {isZh ? `★ 核心结论：${question.takeaway}` : `★ Takeaway: ${question.takeaway}`}
              </Text>
            </Box>
          ) : null}
          <SelectList items={resultActions} selectedIndex={resultActionIndex} />
        </Box>
      ) : phase === "summary" ? (
        <Box flexDirection="column">
          {summaryLines.map((line, index) => (
            <Text
              key={`${line}-${index}`}
              color={index === 0 ? theme.claude : theme.text}
              bold={index === 0}
            >
              {line}
            </Text>
          ))}
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
