// Main-process side of the flashcards feature. Self-contained: removing the feature means deleting this
// file, its one registerFlashcards() call in main.js, and the renderer's flashcards view.
const fs = require("node:fs/promises");
const path = require("node:path");
const { buildCards, buildQuestions, checkAnswer, nextDue, normalizeAnswer, pickSession, scheduleReview } = require("./flashcards");
const { createRemoteValidator } = require("./answer-validator");
const { translateText } = require("./translator");

const MISS = { verdict: "wrong", match: null, accentsOnly: false, rootMatch: false };

function registerFlashcards({ ipcMain, readHistory, dataDir, getSettings, fetchFn }) {
  const storePath = () => path.join(dataDir(), "flashcards.json");
  // Progress before the latest wrong answer per question, so "I was right" can undo that review.
  const lastMiss = new Map();

  // flashcards.json: { version, progress: { [key]: review }, accepted: { [key]: [answers the user overrode] } }
  async function readStore() {
    try {
      const data = JSON.parse(await fs.readFile(storePath(), "utf8"));
      return {
        progress: data?.progress && typeof data.progress === "object" ? data.progress : {},
        accepted: data?.accepted && typeof data.accepted === "object" ? data.accepted : {}
      };
    } catch (error) {
      if (error.code !== "ENOENT") console.error("Could not read flashcard progress:", error);
      return { progress: {}, accepted: {} };
    }
  }

  async function saveStore(store) {
    await fs.mkdir(dataDir(), { recursive: true });
    await fs.writeFile(storePath(), JSON.stringify({ version: 1, ...store }, null, 2));
  }

  async function loadQuestions(mode) {
    const cards = buildCards(await readHistory());
    return { cards, questions: buildQuestions(cards, mode) };
  }

  // Second chance: translate the answer back; if it lands on the prompt, the answer is a valid alternative.
  async function backTranslate(question, answer) {
    if (getSettings().flashcards?.backTranslation === false) return null;
    try {
      const back = await translateText(answer, { source: question.to, target: question.from }, fetchFn);
      const check = checkAnswer(back, [question.prompt], { lang: question.from });
      return check.verdict === "wrong" ? null : back;
    } catch {
      return null;
    }
  }

  function remoteValidator() {
    const remote = getSettings().flashcards?.remoteValidation;
    if (!remote?.enabled) return null;
    return createRemoteValidator({ endpoint: remote.endpoint, apiKey: process.env[remote.apiKeyEnv], fetchFn });
  }

  ipcMain.handle("flashcards:session", async (_event, { mode = "mixed", force = false } = {}) => {
    const { cards, questions } = await loadQuestions(mode);
    const { progress } = await readStore();
    const size = getSettings().flashcards?.sessionSize || 10;
    const session = pickSession(questions, progress, { size, force });
    return {
      // Answers stay in the main process until the user responds.
      questions: session.map(({ key, prompt, from, to }) => ({ key, prompt, from, to, box: progress[key]?.box || 0 })),
      wordCount: cards.length,
      questionCount: questions.length,
      nextDue: session.length ? null : nextDue(questions, progress)
    };
  });

  ipcMain.handle("flashcards:answer", async (_event, { key, answer = "", reveal = false } = {}) => {
    const { questions } = await loadQuestions("mixed");
    const question = questions.find((candidate) => candidate.key === key);
    if (!question) throw new Error("This flashcard no longer exists. Its word may have been removed from history.");
    const store = await readStore();
    const answers = [...question.answers, ...(store.accepted[key] || [])];

    // Order: local check (exact, accents, typos, word roots) → back-translation → optional remote validator.
    let result = reveal ? MISS : checkAnswer(answer, answers, { lang: question.to });
    let feedback = "";
    let validatedBy = "local";
    if (!reveal && result.verdict === "wrong") {
      const back = await backTranslate(question, answer);
      if (back) {
        result = { ...MISS, verdict: "correct", match: answer.trim() };
        feedback = `“${answer.trim()}” translates back to “${back}”, so it counts.`;
        validatedBy = "back-translation";
      }
    }
    const validator = !reveal && result.verdict === "wrong" ? remoteValidator() : null;
    if (validator) {
      const remote = await validator(question, answer);
      if (remote) {
        validatedBy = "remote";
        feedback = remote.feedback || "";
        if (remote.correct) result = { ...MISS, verdict: "correct", match: answer.trim() };
      }
    }

    const correct = result.verdict !== "wrong";
    if (correct) lastMiss.delete(key);
    else lastMiss.set(key, { previous: store.progress[key], answer: answer.trim(), reveal });
    store.progress[key] = scheduleReview(store.progress[key], correct);
    await saveStore(store);
    return { ...result, answers, feedback, validatedBy, box: store.progress[key].box, canOverride: !correct && !reveal && Boolean(answer.trim()) };
  });

  // "I was right": accept the last wrong answer for this question from now on and re-score it as correct.
  ipcMain.handle("flashcards:override", async (_event, { key } = {}) => {
    const miss = lastMiss.get(key);
    if (!miss || miss.reveal || !miss.answer) throw new Error("There is no answer to accept for this card.");
    const store = await readStore();
    const accepted = store.accepted[key] || [];
    if (!accepted.some((value) => normalizeAnswer(value) === normalizeAnswer(miss.answer))) accepted.push(miss.answer);
    store.accepted[key] = accepted;
    store.progress[key] = scheduleReview(miss.previous, true);
    lastMiss.delete(key);
    await saveStore(store);
    return { answer: miss.answer, box: store.progress[key].box };
  });

  ipcMain.handle("flashcards:reset", async () => {
    lastMiss.clear();
    await saveStore({ progress: {}, accepted: {} });
    return true;
  });
}

module.exports = { registerFlashcards };
