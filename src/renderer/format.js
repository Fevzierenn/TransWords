// Pure display helpers shared by the renderer and the Node test suite.
(function (root) {
  const PAIR_SEPARATOR = " — ";

  // Tureng results arrive as "source — translation"; sentences have no separator.
  function splitPair(value) {
    const text = String(value || "");
    const index = text.indexOf(PAIR_SEPARATOR);
    if (index === -1) return { term: "", translation: text };
    return { term: text.slice(0, index), translation: text.slice(index + PAIR_SEPARATOR.length) };
  }

  function shortcutKeys(shortcut) {
    return String(shortcut || "").split("+").filter(Boolean).map((key) => (key === "Control" ? "Ctrl" : key));
  }

  function displayShortcut(shortcut) {
    return shortcutKeys(shortcut).join("+");
  }

  function relativeTime(value, now = Date.now()) {
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return "";
    const seconds = Math.round((now - time) / 1000);
    if (seconds < 45) return "Just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return new Date(time).toLocaleDateString();
  }

  function matchesQuery(item, query) {
    const needle = String(query || "").trim().toLocaleLowerCase();
    if (!needle) return true;
    return [item.source, ...(item.results || [])].some((text) => String(text).toLocaleLowerCase().includes(needle));
  }

  const api = { splitPair, shortcutKeys, displayShortcut, relativeTime, matchesQuery };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TransWordsFormat = api;
})(this);
