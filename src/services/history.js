const HISTORY_LIMIT = 500;

// Newest first; re-translating the same text moves it to the top instead of duplicating it.
function addToHistory(items, item, limit = HISTORY_LIMIT) {
  return [item, ...items.filter((old) => old.source !== item.source)].slice(0, limit);
}

function removeFromHistory(items, id) {
  return items.filter((item) => item.id !== id);
}

module.exports = { HISTORY_LIMIT, addToHistory, removeFromHistory };
