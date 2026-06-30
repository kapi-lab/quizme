import { createTerminal, renderQuestion, renderResult } from "../ui/terminal.js";
import { dedupeQuestions } from "../generation/dedupe.js";
import { generateQuestions, generateWhy } from "../providers/claudeAgent.js";

function normalizeChoice(input) {
  const value = input.trim().toUpperCase();
  if (["1", "A"].includes(value)) return "A";
  if (["2", "B"].includes(value)) return "B";
  if (["3", "C"].includes(value)) return "C";
  if (["4", "D"].includes(value)) return "D";
  return value;
}

export async function runQuizSession({ store, config, source, questionsOverride = null, mode = "mixed" }) {
  const recentQuestions = store.listRecentQuestions(20);

  let questions;
  if (questionsOverride) {
    questions = dedupeQuestions(questionsOverride, recentQuestions).slice(0, 5);
  } else {
    const genStart = Date.now();
    process.stdout.write("Generating questions (0s)");
    const genTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - genStart) / 1000);
      process.stdout.write(`\rGenerating questions (${elapsed}s)`);
    }, 1000);
    try {
      const generated = await generateQuestions({
        source,
        config,
        recentQuestions,
        mode,
        onProgress: () => {}
      });
      clearInterval(genTimer);
      process.stdout.write("\n");
      questions = dedupeQuestions(generated, recentQuestions).slice(0, 5);
    } catch (err) {
      clearInterval(genTimer);
      process.stdout.write("\n");
      throw err;
    }
  }

  if (!questions.length) {
    throw new Error("No fresh questions were generated after dedupe.");
  }

  questions.forEach((question) => store.saveQuestion(question, source.sourceType));
  const terminal = createTerminal();

  try {
    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      const startedAt = Date.now();
      console.log(renderQuestion(question, index, questions.length));
      let answered = false;
      while (!answered) {
        const raw = await terminal.question("> ");
        const input = normalizeChoice(raw);

        if (input === "EXIT") {
          return;
        }
        if (input === "STATS") {
          printStats(store);
          continue;
        }
        if (input === "PROFILE") {
          printProfile(store);
          continue;
        }
        if (input === "REVIEW") {
          console.log("Finish this round first, then run `quizme review`.");
          continue;
        }
        if (input === "WHY") {
          console.log(question.explanation);
          await whyLoop({ terminal, config, question, selected: "none", store });
          continue;
        }
        if (!["A", "B", "C", "D"].includes(input)) {
          console.log("Use A-D, 1-4, why, next, stats, profile, or exit.");
          continue;
        }

        const correct = input === question.answer;
        store.recordAttempt({
          questionId: question.id,
          selected: input,
          correct,
          durationMs: Date.now() - startedAt,
          tags: question.tags
        });
        question.tags.forEach((tag) => store.updateSignal(tag, correct));
        store.upsertReviewItem(question.id, correct);
        console.log(renderResult(question, input));
        answered = true;

        while (true) {
          const follow = normalizeChoice(await terminal.question("> "));
          if (follow === "WHY") {
            await whyLoop({ terminal, config, question, selected: input, store });
            continue;
          }
          if (follow === "STATS") {
            printStats(store);
            continue;
          }
          if (follow === "PROFILE") {
            printProfile(store);
            continue;
          }
          break;
        }
      }
    }
  } finally {
    terminal.close();
  }
}

async function whyLoop({ terminal, config, question, selected, store }) {
  const turns = [];
  while (true) {
    const asked = await terminal.question("why> ");
    const normalized = asked.trim().toLowerCase();
    if (["back", "next", "quiz"].includes(normalized)) {
      if (turns.length) {
        store.appendWhyThread(question.id, turns);
      }
      return;
    }

    process.stdout.write("\n");
    let streamed = false;
    let answer = "";
    try {
      answer = await generateWhy({
        question,
        config,
        asked,
        userAnswer: selected,
        onProgress: (text) => {
          streamed = true;
          process.stdout.write(text);
        }
      });
    } catch (err) {
      process.stdout.write("\n");
      throw err;
    }

    if (streamed) {
      process.stdout.write("\n");
    } else {
      console.log(answer);
    }

    turns.push({ asked, answer, at: new Date().toISOString() });
  }
}

export function printStats(store) {
  const stats = store.getStats();
  const week = renderWeek(stats.weekRows);
  console.log([
    "",
    "QuizMe Stats",
    `Streak: ${stats.currentStreak} days`,
    `Best streak: ${stats.longestStreak} days`,
    `Today: ${stats.todayCount} questions`,
    `All-time: ${stats.attemptsTotal} questions`,
    `Accuracy: ${(stats.accuracy * 100).toFixed(0)}%`,
    `Review queue: ${stats.reviewPending}`,
    `Why threads: ${stats.whyCount}`,
    `XP: ${stats.xp}`,
    `Level: ${stats.level}`,
    "",
    "Last 7 days:",
    week
  ].join("\n"));
}

export function printProfile(store) {
  const signals = store.getProfileSignals();
  const strong = signals.slice(0, 3).map(formatSignal).join(", ") || "Still learning your profile";
  const weakSignals = [...signals]
    .filter((item) => item.wrongCount > 0)
    .sort((a, b) => a.score - b.score || b.wrongCount - a.wrongCount)
    .slice(0, 3);
  const weak = weakSignals.map(formatSignal).join(", ") || "Not enough data";
  const profileRead = buildProfileRead(signals);
  console.log([
    "",
    "QuizMe Profile",
    profileRead,
    `Strong: ${strong}`,
    `Needs review: ${weak}`
  ].join("\n"));
}

function formatSignal(item) {
  return `${item.tag} (${Math.round(item.score * 100)}%, ${item.trend})`;
}

function buildProfileRead(signals) {
  if (!signals.length) {
    return "Current read: still learning your profile.";
  }
  const strongest = signals[0];
  const weakest = [...signals].sort((a, b) => a.score - b.score)[0];
  return `Current read: stronger on ${strongest.tag}, weaker on ${weakest.tag}.`;
}

function renderWeek(weekRows) {
  if (!weekRows.length) {
    return "No activity yet.";
  }
  return weekRows
    .map(([day, count]) => `${day} ${"#".repeat(Number(count))} ${count}`)
    .join("\n");
}
