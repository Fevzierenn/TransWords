const test = require("node:test");
const assert = require("node:assert/strict");
const { guessSourceLanguage, parseTureng, translate } = require("../src/services/translator");
const { captureSelectedText } = require("../src/services/selection-capture");
const { DEFAULT_SETTINGS, mergeSettings, normalizeShortcut } = require("../src/services/settings");

test("detects explicitly Turkish characters", () => {
  assert.equal(guessSourceLanguage("güzel bir gün"), "tr");
  assert.equal(guessSourceLanguage("a beautiful day"), "auto");
});

test("extracts unique Tureng table results", () => {
  const html = '<table><tr><td>1.</td><td>General</td><td>hello</td><td>merhaba</td></tr><tr><td>2.</td><td>General</td><td>hello</td><td>selam</td></tr></table>';
  assert.deepEqual(parseTureng(html), ["hello — merhaba", "hello — selam"]);
});

test("routes a single word to Tureng", async () => {
  const fakeFetch = async (url) => ({
    ok: true,
    text: async () => '<tr><td>1.</td><td>General</td><td>book</td><td>kitap</td></tr>'
  });
  const result = await translate("book", fakeFetch);
  assert.equal(result.provider, "Tureng");
  assert.deepEqual(result.results, ["book — kitap"]);
});

test("routes sentences to Google Translate", async () => {
  let calls = 0;
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ++calls === 1
      ? [[['Hello world', 'Hello world']], null, 'en']
      : [[['Merhaba dünya', 'Hello world']], null, 'en']
  });
  const result = await translate("Hello world", fakeFetch);
  assert.deepEqual(result.results, ["Merhaba dünya"]);
});

test("uses detected Turkish for sentences without Turkish-specific characters", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => [[['hello world', 'merhaba dünya']], null, 'tr']
  });
  const result = await translate("merhaba dünya", fakeFetch);
  assert.deepEqual(result.results, ["hello world"]);
});

test("captures newly selected text instead of stale clipboard content", async () => {
  let value = "old clipboard value";
  const clipboard = {
    writeText: (text) => { value = text; },
    readText: () => value,
    clear: () => { value = ""; }
  };
  const keyboard = { type: async () => { value = "selected sentence"; } };
  const result = await captureSelectedText({
    clipboard,
    keyboard,
    Key: { LeftControl: "ctrl", C: "c" },
    waitFn: async () => {}
  });
  assert.equal(result, "selected sentence");
});

test("rejects when Ctrl+C does not produce selected text", async () => {
  let value = "";
  const clipboard = {
    writeText: (text) => { value = text; },
    readText: () => value,
    clear: () => { value = ""; }
  };
  await assert.rejects(
    captureSelectedText({
      clipboard,
      keyboard: { type: async () => {} },
      Key: { LeftControl: "ctrl", C: "c" },
      timeoutMs: -1,
      waitFn: async () => {}
    }),
    /No selected text/
  );
  assert.equal(value, "");
});

test("normalizes configurable keyboard shortcuts", () => {
  assert.equal(normalizeShortcut("ctrl+shift+y"), "Control+Shift+Y");
  assert.equal(normalizeShortcut("Alt+F8"), "Alt+F8");
  assert.throws(() => normalizeShortcut("T"), /modifier/);
});

test("merges settings while rejecting invalid colors and fonts", () => {
  const settings = mergeSettings({
    font: "comic-sans",
    themes: { light: { inputBackground: "red", outputBackground: "#123456" } }
  });
  assert.equal(settings.font, DEFAULT_SETTINGS.font);
  assert.equal(settings.themes.light.inputBackground, DEFAULT_SETTINGS.themes.light.inputBackground);
  assert.equal(settings.themes.light.outputBackground, "#123456");
});

test("restores the owner's chosen default palette", () => {
  const defaults = mergeSettings();
  assert.equal(defaults.themes.light.appBackground, "#f4f1e8");
  assert.equal(defaults.themes.light.buttonBackground, "#8c4114");
  assert.equal(defaults.themes.dark.appBackground, "#151515");
  assert.equal(defaults.themes.dark.buttonBackground, "#d97757");
});
