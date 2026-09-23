// Pure flashcard logic: builds cards from translation history, schedules reviews, and checks answers.
const PAIR_SEPARATOR = " — ";
// Tureng tags the English side of each row with a part of speech: "love i.", "utilize f.", "snob s.".
const POS_TAG = /\s+[a-zçğıöşü]{1,6}\.$/;
const TURKISH_CHARS = /[çğıöşü]/i;
const MODES = new Set(["en-tr", "tr-en", "mixed"]);
// Leitner boxes 1–5: days until the next review after landing in each box.
const BOX_INTERVAL_DAYS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 };
const DAY_MS = 24 * 60 * 60 * 1000;
const TURKISH_FOLD = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

function stripTag(text) {
  return String(text || "").replace(POS_TAG, "").trim();
}

function normalizeAnswer(text) {
  return String(text || "")
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:to|a|an|the) (?=\S)/, "");
}

function foldTurkish(text) {
  return text.replace(/[çğıöşüâîû]/g, (char) => TURKISH_FOLD[char]);
}

function levenshtein(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

// Word-form endings stripped before comparing roots (inputs are already folded, so no Turkish letters).
const ROOT_SUFFIXES = {
  tr: ["mek", "mak", "ler", "lar", "me", "ma"],
  en: ["ing", "ed", "es", "s"]
};
const MIN_ROOT_LENGTH = 3;

// Strips one common suffix from the last word, so "deneme"/"denemek" → "dene" and "trying" → "try".
function wordRoot(word, lang) {
  const text = String(word || "").trim();
  if (!text) return "";
  const words = text.split(" ");
  const last = words.pop();
  const lists = lang === "tr" || lang === "en" ? [ROOT_SUFFIXES[lang]] : [ROOT_SUFFIXES.tr, ROOT_SUFFIXES.en];
  for (const suffixes of lists) {
    const suffix = [...suffixes].sort((a, b) => b.length - a.length)
      .find((candidate) => last.endsWith(candidate) && last.length - candidate.length >= MIN_ROOT_LENGTH);
    if (suffix) return [...words, last.slice(0, -suffix.length)].join(" ");
  }
  return [...words, last].join(" ");
}

function rootsMatch(given, variant, lang) {
  const givenRoot = wordRoot(given, lang);
  const variantRoot = wordRoot(variant, lang);
  if (!givenRoot || !variantRoot) return false;
  return givenRoot === variantRoot || given === variantRoot || givenRoot === variant;
}

function typoAllowance(length) {
  if (length <= 3) return 0;
  return length <= 6 ? 1 : 2;
}

// Each accepted meaning also counts through its comma/semicolon/slash separated parts.
function answerVariants(accepted) {
  const variants = new Set();
  for (const meaning of accepted) {
    for (const part of [meaning, ...String(meaning).split(/[,;/]/)]) {
      const normalized = normalizeAnswer(part);
      if (normalized) variants.add(normalized);
    }
  }
  return [...variants];
}

// verdict: "correct" (exact, or only Turkish accents differ), "almost" (small typo or another form of
// the same word, e.g. "dene" for "deneme"), "wrong". `lang` is the answer language, when known.
function checkAnswer(answer, accepted, { lang } = {}) {
  const result = (verdict, match = null, extra = {}) => ({ verdict, match, accentsOnly: false, rootMatch: false, ...extra });
  const given = normalizeAnswer(answer);
  if (!given) return result("wrong");
  const variants = answerVariants(accepted);
  const exact = variants.find((variant) => variant === given);
  if (exact) return result("correct", exact);
  const folded = foldTurkish(given);
  const accents = variants.find((variant) => foldTurkish(variant) === folded);
  if (accents) return result("correct", accents, { accentsOnly: true });
  const close = variants.find((variant) => levenshtein(folded, foldTurkish(variant)) <= typoAllowance(variant.length));
  if (close) return result("almost", close);
  const sameRoot = variants.find((variant) => rootsMatch(folded, foldTurkish(variant), lang));
  if (sameRoot) return result("almost", sameRoot, { rootMatch: true });
  return result("wrong");
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = normalizeAnswer(value);
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cardLanguage(source, rows) {
  const termTagged = rows.filter((row) => POS_TAG.test(row.term)).length;
  const translationTagged = rows.filter((row) => POS_TAG.test(row.translation)).length;
  if (termTagged !== translationTagged) return termTagged > translationTagged ? "en" : "tr";
  if (TURKISH_CHARS.test(source)) return "tr";
  if (rows.some((row) => TURKISH_CHARS.test(row.translation))) return "en";
  return "en";
}

function splitRow(value) {
  const text = String(value || "");
  const index = text.indexOf(PAIR_SEPARATOR);
  if (index === -1) return { term: "", translation: text.trim() };
  return { term: text.slice(0, index).trim(), translation: text.slice(index + PAIR_SEPARATOR.length).trim() };
}

// One card per previously searched single word. Only dictionary rows whose term is the searched
// word itself are kept, so phrases like "klima kurulumu" do not become answers for "kurulumu".
function buildCards(history) {
  const cards = [];
  const seen = new Set();
  for (const item of history || []) {
    const word = String(item?.source || "").trim();
    const key = normalizeAnswer(word);
    if (!word || /\s/.test(word) || seen.has(key) || !Array.isArray(item.results)) continue;
    const rows = item.results.map(splitRow);
    const paired = rows.some((row) => row.term);
    const matching = paired ? rows.filter((row) => normalizeAnswer(stripTag(row.term)) === key) : rows;
    const meanings = unique(matching.map((row) => stripTag(row.translation)));
    if (!meanings.length) continue;
    seen.add(key);
    cards.push({ id: key, word, lang: cardLanguage(word, matching), meanings });
  }
  return cards;
}

// Forward questions ask for a word's meaning; reverse questions show a meaning and ask for the word.
function buildQuestions(cards, mode = "mixed") {
  const selected = MODES.has(mode) ? mode : "mixed";
  const questions = [];
  for (const card of cards) {
    const other = card.lang === "en" ? "tr" : "en";
    const forward = { key: `f|${card.id}`, prompt: card.word, from: card.lang, to: other, answers: card.meanings };
    const promptMeaning = card.meanings[0];
    const reverse = {
      key: `r|${card.id}`,
      prompt: promptMeaning,
      from: other,
      to: card.lang,
      // Any searched word that shares this meaning is a valid answer.
      answers: unique(cards
        .filter((candidate) => candidate.lang === card.lang && candidate.meanings.some((meaning) => checkAnswer(meaning, [promptMeaning]).verdict === "correct"))
        .map((candidate) => candidate.word))
    };
    for (const question of [forward, reverse]) {
      if (selected === "mixed" || selected === `${question.from}-${question.to}`) questions.push(question);
    }
  }
  return questions;
}

function isDue(entry, now) {
  return !entry || new Date(entry.due).getTime() <= now;
}

// Due questions first (lowest box, then oldest due date); `random` breaks ties for variety.
function pickSession(questions, progress = {}, { now = Date.now(), size = 10, force = false, random = Math.random } = {}) {
  const pool = force ? questions : questions.filter((question) => isDue(progress[question.key], now));
  const ranked = pool
    .map((question) => ({ question, box: progress[question.key]?.box || 0, due: new Date(progress[question.key]?.due || 0).getTime(), tie: random() }))
    .sort((a, b) => a.box - b.box || a.due - b.due || a.tie - b.tie);
  return ranked.slice(0, size).map((entry) => entry.question);
}

function nextDue(questions, progress = {}) {
  const times = questions.map((question) => progress[question.key]).filter(Boolean).map((entry) => new Date(entry.due).getTime());
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

function scheduleReview(entry, correct, now = Date.now()) {
  const previous = entry || { box: 1, correct: 0, wrong: 0 };
  const box = correct ? Math.min((previous.box || 1) + 1, 5) : 1;
  return {
    box,
    due: new Date(now + BOX_INTERVAL_DAYS[box] * DAY_MS).toISOString(),
    correct: (previous.correct || 0) + (correct ? 1 : 0),
    wrong: (previous.wrong || 0) + (correct ? 0 : 1),
    lastReviewed: new Date(now).toISOString()
  };
}

module.exports = {
  BOX_INTERVAL_DAYS,
  buildCards,
  buildQuestions,
  checkAnswer,
  foldTurkish,
  levenshtein,
  nextDue,
  normalizeAnswer,
  pickSession,
  scheduleReview,
  stripTag,
  wordRoot
};
