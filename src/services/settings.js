const DEFAULT_SETTINGS = Object.freeze({
  shortcut: "Control+T",
  font: "default",
  themes: {
    light: {
      appBackground: "#f4f1e8",
      appText: "#17241f",
      inputBackground: "#fffefa",
      inputText: "#17241f",
      outputBackground: "#29364a",
      outputText: "#f7f9fc",
      buttonBackground: "#17633d",
      buttonText: "#ffffff",
      secondaryButtonBackground: "#e5eee5",
      secondaryButtonText: "#315c45"
    },
    dark: {
      appBackground: "#101713",
      appText: "#edf4ed",
      inputBackground: "#19221d",
      inputText: "#edf4ed",
      outputBackground: "#1c2635",
      outputText: "#f3f6fb",
      buttonBackground: "#48a875",
      buttonText: "#ffffff",
      secondaryButtonBackground: "#283a30",
      secondaryButtonText: "#c0dfca"
    }
  }
});

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const VALID_FONTS = new Set(["default", "sans", "arial"]);
const VALID_MODIFIERS = new Set(["Control", "Alt", "Shift"]);

function normalizeShortcut(value) {
  const parts = String(value || "").split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) throw new Error("Shortcut needs a modifier and a key.");
  const key = parts.pop();
  const modifiers = [...new Set(parts.map((part) => {
    const normalized = part.toLowerCase();
    if (normalized === "ctrl" || normalized === "control") return "Control";
    if (normalized === "alt") return "Alt";
    if (normalized === "shift") return "Shift";
    throw new Error(`Unsupported shortcut modifier: ${part}`);
  }))];
  if (!modifiers.some((modifier) => VALID_MODIFIERS.has(modifier))) {
    throw new Error("Shortcut needs Ctrl, Alt, or Shift.");
  }
  const normalizedKey = key.length === 1 ? key.toUpperCase() : key;
  if (!/^[A-Z0-9]$/.test(normalizedKey) && !/^F(?:[1-9]|1[0-2])$/.test(normalizedKey)) {
    throw new Error("Use a letter, number, or F1–F12 as the shortcut key.");
  }
  return [...modifiers, normalizedKey].join("+");
}

function safeColor(value, fallback) {
  return COLOR_PATTERN.test(String(value || "")) ? value.toLowerCase() : fallback;
}

function mergeSettings(value = {}) {
  const themes = {};
  for (const theme of ["light", "dark"]) {
    themes[theme] = {};
    for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS.themes[theme])) {
      themes[theme][key] = safeColor(value.themes?.[theme]?.[key], fallback);
    }
  }
  let shortcut = DEFAULT_SETTINGS.shortcut;
  try { shortcut = normalizeShortcut(value.shortcut || shortcut); } catch { /* Use default. */ }
  return {
    shortcut,
    font: VALID_FONTS.has(value.font) ? value.font : DEFAULT_SETTINGS.font,
    themes
  };
}

module.exports = { DEFAULT_SETTINGS, mergeSettings, normalizeShortcut };
