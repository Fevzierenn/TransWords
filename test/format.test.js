const test = require("node:test");
const assert = require("node:assert/strict");
const { splitPair, shortcutKeys, displayShortcut, relativeTime, matchesQuery } = require("../src/renderer/format");

test("splits Tureng results into term and translation", () => {
  assert.deepEqual(splitPair("hello — merhaba"), { term: "hello", translation: "merhaba" });
  assert.deepEqual(splitPair("say hello — selam söyle — selam ver"), { term: "say hello", translation: "selam söyle — selam ver" });
});

test("keeps sentence results as a translation without a term", () => {
  assert.deepEqual(splitPair("Merhaba dünya"), { term: "", translation: "Merhaba dünya" });
});

test("shows Control as Ctrl in shortcuts", () => {
  assert.deepEqual(shortcutKeys("Control+Shift+Y"), ["Ctrl", "Shift", "Y"]);
  assert.equal(displayShortcut("Control+T"), "Ctrl+T");
});

test("describes history times relative to now", () => {
  const now = Date.parse("2026-09-23T12:00:00Z");
  assert.equal(relativeTime("2026-09-23T11:59:50Z", now), "Just now");
  assert.equal(relativeTime("2026-09-23T11:50:00Z", now), "10 min ago");
  assert.equal(relativeTime("2026-09-23T09:00:00Z", now), "3 h ago");
  assert.equal(relativeTime("2026-09-22T12:00:00Z", now), "Yesterday");
  assert.equal(relativeTime("2026-09-20T12:00:00Z", now), "3 days ago");
  assert.equal(relativeTime("not a date", now), "");
});

test("filters history by source or translation, ignoring case", () => {
  const item = { source: "Book", results: ["book — kitap"] };
  assert.equal(matchesQuery(item, ""), true);
  assert.equal(matchesQuery(item, "book"), true);
  assert.equal(matchesQuery(item, "KİTAP".toLocaleLowerCase("tr")), true);
  assert.equal(matchesQuery(item, "pencil"), false);
});
