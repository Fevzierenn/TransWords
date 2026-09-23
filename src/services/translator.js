const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/;

function stripTags(value) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseTureng(html) {
  const results = [];
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row;
  while ((row = rowPattern.exec(html)) !== null) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((match) => stripTags(match[1]))
      .filter(Boolean);
    if (cells.length < 3) continue;
    const parts = cells.filter((cell) => !/^\d+\.?$/.test(cell));
    const translation = parts.at(-1);
    const source = parts.at(-2);
    if (source && translation && source !== translation) {
      const value = `${source} — ${translation}`;
      if (!results.includes(value)) results.push(value);
    }
    if (results.length === 8) break;
  }
  return results;
}

function guessSourceLanguage(text) {
  return TURKISH_CHARS.test(text) ? "tr" : "auto";
}

async function translateWord(text, fetchFn = fetch) {
  const url = `https://tureng.com/tr/turkce-ingilizce/${encodeURIComponent(text)}`;
  try {
    const response = await fetchFn(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
        Accept: "text/html,application/xhtml+xml"
      }
    });
    if (!response.ok) throw new Error(`Tureng request failed (${response.status})`);
    const results = parseTureng(await response.text());
    if (!results.length) throw new Error("Tureng returned no translation");
    return { provider: "Tureng", results, turengUrl: url };
  } catch (turengError) {
    const fallback = await translateSentence(text, fetchFn);
    return {
      ...fallback,
      provider: "Google Translate · Tureng unavailable",
      turengUrl: url,
      warning: turengError.message
    };
  }
}

async function translateSentence(text, fetchFn = fetch) {
  const hintedSource = guessSourceLanguage(text);
  const request = async (target) => {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", hintedSource);
  url.searchParams.set("tl", target);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`Translation request failed (${response.status})`);
  const payload = await response.json();
  const translated = payload?.[0]?.map((segment) => segment?.[0] || "").join("").trim();
  if (!translated) throw new Error("No translation was returned");
    return { translated, detected: payload?.[2] };
  };

  if (hintedSource === "tr") {
    const result = await request("en");
    return { provider: "Google Translate", results: [result.translated] };
  }
  const first = await request("en");
  if (first.detected === "en") {
    const second = await request("tr");
    return { provider: "Google Translate", results: [second.translated] };
  }
  return { provider: "Google Translate", results: [first.translated] };
}

// Direct translation with explicit languages; used to back-translate flashcard answers.
async function translateText(text, { source, target }, fetchFn = fetch, { timeoutMs = 4000 } = {}) {
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Nothing to translate");
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", source);
  url.searchParams.set("tl", target);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", clean);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Translation request failed (${response.status})`);
    const payload = await response.json();
    const translated = payload?.[0]?.map((segment) => segment?.[0] || "").join("").trim();
    if (!translated) throw new Error("No translation was returned");
    return translated;
  } finally {
    clearTimeout(timer);
  }
}

async function translate(text, fetchFn = fetch) {
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Enter or copy text to translate");
  return /\s/.test(clean)
    ? translateSentence(clean, fetchFn)
    : translateWord(clean, fetchFn);
}

module.exports = { guessSourceLanguage, parseTureng, translate, translateSentence, translateText, translateWord };
