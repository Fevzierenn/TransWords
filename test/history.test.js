const test = require("node:test");
const assert = require("node:assert/strict");
const { addToHistory, removeFromHistory } = require("../src/services/history");

test("adds new translations first and moves repeated text to the top", () => {
  const items = [{ id: "1", source: "book" }, { id: "2", source: "pen" }];
  const next = addToHistory(items, { id: "3", source: "pen" });
  assert.deepEqual(next.map((item) => item.id), ["3", "1"]);
});

test("caps history at the configured limit", () => {
  const items = [{ id: "1", source: "a" }, { id: "2", source: "b" }];
  assert.deepEqual(addToHistory(items, { id: "3", source: "c" }, 2).map((item) => item.id), ["3", "1"]);
});

test("removes a single history entry by id", () => {
  const items = [{ id: "1", source: "a" }, { id: "2", source: "b" }];
  assert.deepEqual(removeFromHistory(items, "1"), [{ id: "2", source: "b" }]);
  assert.deepEqual(removeFromHistory(items, "missing"), items);
});
