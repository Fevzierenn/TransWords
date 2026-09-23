const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCards,
  buildQuestions,
  checkAnswer,
  nextDue,
  pickSession,
  scheduleReview,
  wordRoot
} = require("../src/services/flashcards");

const NOW = Date.parse("2026-09-23T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const HISTORY = [
  { source: "love", results: ["love i. — aşk", "love i. — sevda", "love f. — sevmek", "love affair i. — aşk ilişkisi"] },
  { source: "tutkunluk", results: ["tutkunluk — passion i.", "tutkunluk — love i."] },
  { source: "kurulumu", results: ["klima kurulumu — air conditioner installation i."] },
  { source: "Utilize", results: ["utilize f. — faydalanmak", "utilize f. — yararlanmak"] },
  { source: "The weather is nice", results: ["Hava güzel"] },
  { source: "LOVE", results: ["love i. — sevgi"] },
  { source: "elma", results: ["apple"] }
];

test("builds one card per searched word with language from the part-of-speech tag", () => {
  const cards = buildCards(HISTORY);
  assert.deepEqual(cards.map((card) => card.word), ["love", "tutkunluk", "Utilize", "elma"]);
  const love = cards.find((card) => card.word === "love");
  assert.equal(love.lang, "en");
  assert.deepEqual(love.meanings, ["aşk", "sevda", "sevmek"]);
  const tutkunluk = cards.find((card) => card.word === "tutkunluk");
  assert.equal(tutkunluk.lang, "tr");
  assert.deepEqual(tutkunluk.meanings, ["passion", "love"]);
});

test("skips sentences, duplicate words, and words with only phrase rows", () => {
  const words = buildCards(HISTORY).map((card) => card.id);
  assert.ok(!words.includes("kurulumu"));
  assert.ok(!words.includes("the weather is nice"));
  assert.equal(words.filter((id) => id === "love").length, 1);
});

test("keeps Google results without dictionary pairs as meanings", () => {
  const elma = buildCards(HISTORY).find((card) => card.word === "elma");
  assert.deepEqual(elma.meanings, ["apple"]);
});

test("asks English prompts only in English to Turkish mode", () => {
  const questions = buildQuestions(buildCards(HISTORY), "en-tr");
  assert.deepEqual(questions.map((question) => question.key), ["f|love", "r|tutkunluk", "f|utilize", "f|elma"]);
  assert.ok(questions.every((question) => question.from === "en" && question.to === "tr"));
  const reverse = questions.find((question) => question.key === "r|tutkunluk");
  assert.equal(reverse.prompt, "passion");
  assert.deepEqual(reverse.answers, ["tutkunluk"]);
});

test("asks Turkish prompts only in Turkish to English mode", () => {
  const questions = buildQuestions(buildCards(HISTORY), "tr-en");
  assert.deepEqual(questions.map((question) => question.key), ["r|love", "f|tutkunluk", "r|utilize", "r|elma"]);
  assert.ok(questions.every((question) => question.from === "tr" && question.to === "en"));
  assert.equal(questions[0].prompt, "aşk");
  assert.deepEqual(questions[0].answers, ["love"]);
});

test("includes both directions in mixed mode", () => {
  const questions = buildQuestions(buildCards(HISTORY), "mixed");
  assert.equal(questions.length, 8);
  assert.equal(buildQuestions(buildCards(HISTORY), "unknown").length, 8);
});

test("accepts every searched word that shares the prompted meaning", () => {
  const cards = buildCards([
    { source: "aşk", results: ["aşk — love i.", "aşk — passion i."] },
    { source: "tutkunluk", results: ["tutkunluk — passion i.", "tutkunluk — love i."] }
  ]);
  const reverse = buildQuestions(cards, "en-tr").find((question) => question.key === "r|aşk");
  assert.equal(reverse.prompt, "love");
  assert.deepEqual(reverse.answers, ["aşk", "tutkunluk"]);
});

test("accepts exact answers ignoring case and leading articles", () => {
  assert.equal(checkAnswer("aşk", ["aşk", "sevda"]).verdict, "correct");
  assert.equal(checkAnswer("AŞK", ["aşk"]).verdict, "correct");
  assert.equal(checkAnswer("İyi", ["iyi"]).verdict, "correct");
  assert.equal(checkAnswer("to utilize", ["utilize"]).verdict, "correct");
});

test("accepts answers typed without Turkish characters and flags it", () => {
  const result = checkAnswer("ask", ["aşk"]);
  assert.equal(result.verdict, "correct");
  assert.equal(result.accentsOnly, true);
  assert.equal(result.match, "aşk");
});

test("treats a small typo in a long word as almost correct", () => {
  const result = checkAnswer("faydalanmk", ["faydalanmak"]);
  assert.equal(result.verdict, "almost");
  assert.equal(result.match, "faydalanmak");
});

test("allows no typos in very short words", () => {
  assert.equal(checkAnswer("ak", ["aşk"]).verdict, "wrong");
});

test("accepts any comma-separated part of a meaning", () => {
  assert.equal(checkAnswer("defter", ["kitap, defter"]).verdict, "correct");
});

test("rejects empty and unrelated answers", () => {
  assert.equal(checkAnswer("   ", ["aşk"]).verdict, "wrong");
  assert.equal(checkAnswer("masa", ["aşk", "sevda"]).verdict, "wrong");
});

test("moves correct answers up a box and caps at box five", () => {
  const first = scheduleReview(undefined, true, NOW);
  assert.equal(first.box, 2);
  assert.equal(first.due, new Date(NOW + DAY).toISOString());
  assert.equal(first.correct, 1);
  assert.equal(first.wrong, 0);
  assert.equal(first.lastReviewed, new Date(NOW).toISOString());
  const top = scheduleReview({ box: 5, correct: 4, wrong: 1 }, true, NOW);
  assert.equal(top.box, 5);
  assert.equal(top.due, new Date(NOW + 14 * DAY).toISOString());
  assert.equal(top.correct, 5);
});

test("sends wrong answers back to box one and due immediately", () => {
  const entry = scheduleReview({ box: 4, correct: 3, wrong: 0 }, false, NOW);
  assert.equal(entry.box, 1);
  assert.equal(entry.due, new Date(NOW).toISOString());
  assert.equal(entry.correct, 3);
  assert.equal(entry.wrong, 1);
});

test("picks due questions with new and low-box cards first", () => {
  const questions = ["a", "b", "c", "d", "e"].map((key) => ({ key }));
  const progress = {
    a: { box: 3, due: new Date(NOW - DAY).toISOString() },
    b: { box: 2, due: new Date(NOW + DAY).toISOString() },
    d: { box: 1, due: new Date(NOW - 2 * DAY).toISOString() },
    e: { box: 3, due: new Date(NOW - 3 * DAY).toISOString() }
  };
  const options = { now: NOW, random: () => 0 };
  assert.deepEqual(pickSession(questions, progress, options).map((q) => q.key), ["c", "d", "e", "a"]);
  assert.deepEqual(pickSession(questions, progress, { ...options, size: 2 }).map((q) => q.key), ["c", "d"]);
  assert.deepEqual(pickSession(questions, progress, { ...options, force: true }).map((q) => q.key), ["c", "d", "b", "e", "a"]);
});

test("reports the earliest upcoming review", () => {
  const questions = [{ key: "a" }, { key: "b" }, { key: "c" }];
  const progress = {
    a: { box: 2, due: "2026-09-25T00:00:00.000Z" },
    b: { box: 3, due: "2026-09-24T00:00:00.000Z" }
  };
  assert.equal(nextDue(questions, progress), "2026-09-24T00:00:00.000Z");
  assert.equal(nextDue(questions, {}), null);
});

test("accepts another form of the same Turkish word as almost", () => {
  const dene = checkAnswer("dene", ["deneme"]);
  assert.equal(dene.verdict, "almost");
  assert.equal(dene.match, "deneme");
  assert.equal(dene.rootMatch, true);
  assert.equal(checkAnswer("denemek", ["deneme"]).verdict, "almost");
  const plural = checkAnswer("kitaplar", ["kitap"], { lang: "tr" });
  assert.equal(plural.verdict, "almost");
  assert.equal(plural.rootMatch, true);
});

test("accepts English word forms when the answer language is English", () => {
  const result = checkAnswer("trying", ["try"], { lang: "en" });
  assert.equal(result.verdict, "almost");
  assert.equal(result.match, "try");
  assert.equal(result.rootMatch, true);
});

test("only strips suffixes of the answer language", () => {
  assert.equal(checkAnswer("ringing", ["ring"], { lang: "tr" }).verdict, "wrong");
  assert.equal(checkAnswer("ringing", ["ring"], { lang: "en" }).verdict, "almost");
});

test("does not match roots shorter than three letters or unrelated words", () => {
  assert.equal(checkAnswer("ama", ["a"]).verdict, "wrong");
  assert.equal(checkAnswer("ma", ["a"]).verdict, "wrong");
  assert.equal(checkAnswer("masa", ["deneme"]).verdict, "wrong");
  assert.equal(checkAnswer("aşk", ["aşk"]).rootMatch, false);
});

test("finds word roots by stripping one suffix from the last word", () => {
  assert.equal(wordRoot("deneme"), "dene");
  assert.equal(wordRoot("denemek", "tr"), "dene");
  assert.equal(wordRoot("rezervasyon yapmak", "tr"), "rezervasyon yap");
  assert.equal(wordRoot("trying", "en"), "try");
  assert.equal(wordRoot("ring", "en"), "ring");
  assert.equal(wordRoot(""), "");
});
