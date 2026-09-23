const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DEFAULT_SETTINGS, mergeSettings } = require("../src/services/settings");
const { registerFlashcards } = require("../src/services/flashcards-ipc");

const HISTORY = [{ source: "try", results: ["try f. — deneme", "try f. — çalışmak"] }];

// Registers the real handlers against a fake ipcMain, a temp folder, and a fake Google endpoint.
function setup({ settings = DEFAULT_SETTINGS, translations = {} } = {}) {
  const handlers = {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "transwords-test-"));
  const fetchFn = async (url) => {
    const q = new URL(url).searchParams.get("q");
    return { ok: true, json: async () => [[[translations[q] || q, q]], null, "tr"] };
  };
  registerFlashcards({
    ipcMain: { handle: (name, handler) => { handlers[name] = handler; } },
    readHistory: async () => HISTORY,
    dataDir: () => dir,
    getSettings: () => settings,
    fetchFn
  });
  const call = (name, payload) => handlers[name](null, payload);
  const store = () => JSON.parse(fs.readFileSync(path.join(dir, "flashcards.json"), "utf8"));
  return { call, store };
}

test("accepts another form of the word as almost", async () => {
  const { call } = setup();
  const result = await call("flashcards:answer", { key: "f|try", answer: "dene" });
  assert.equal(result.verdict, "almost");
  assert.equal(result.match, "deneme");
  assert.equal(result.validatedBy, "local");
});

test("accepts an answer that translates back to the prompt", async () => {
  const { call } = setup({ translations: { uğraşmak: "try" } });
  const result = await call("flashcards:answer", { key: "f|try", answer: "uğraşmak" });
  assert.equal(result.verdict, "correct");
  assert.equal(result.validatedBy, "back-translation");
  assert.match(result.feedback, /translates back to “try”/);
});

test("skips back-translation when it is turned off", async () => {
  const settings = mergeSettings({ flashcards: { backTranslation: false } });
  const { call } = setup({ settings, translations: { uğraşmak: "try" } });
  const result = await call("flashcards:answer", { key: "f|try", answer: "uğraşmak" });
  assert.equal(result.verdict, "wrong");
  assert.equal(result.canOverride, true);
});

test("I was right accepts the answer from now on and re-scores the card", async () => {
  const { call, store } = setup();
  const wrong = await call("flashcards:answer", { key: "f|try", answer: "girişmek" });
  assert.equal(wrong.verdict, "wrong");
  assert.equal(store().progress["f|try"].wrong, 1);

  const override = await call("flashcards:override", { key: "f|try" });
  assert.equal(override.answer, "girişmek");
  assert.equal(override.box, 2);
  assert.deepEqual(store().accepted["f|try"], ["girişmek"]);
  assert.equal(store().progress["f|try"].wrong, 0);

  const again = await call("flashcards:answer", { key: "f|try", answer: "girişmek" });
  assert.equal(again.verdict, "correct");
});

test("I was right is not offered after I don't know", async () => {
  const { call } = setup();
  const result = await call("flashcards:answer", { key: "f|try", reveal: true });
  assert.equal(result.canOverride, false);
  await assert.rejects(call("flashcards:override", { key: "f|try" }), /no answer to accept/);
});
