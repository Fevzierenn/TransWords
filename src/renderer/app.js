const source = document.querySelector("#source");
const status = document.querySelector("#status");
const result = document.querySelector("#result");
const loading = document.querySelector("#loading");
const translations = document.querySelector("#translations");
const provider = document.querySelector("#provider");
const translateButton = document.querySelector("#translate");
const themeToggle = document.querySelector("#themeToggle");
const themeIcon = document.querySelector("#themeIcon");
const settingsDialog = document.querySelector("#settingsDialog");
const shortcutInput = document.querySelector("#shortcutInput");
const fontSelect = document.querySelector("#fontSelect");
const settingsStatus = document.querySelector("#settingsStatus");
let currentResult = [];
let appSettings;
let settingsDraft;
let paletteTheme = "light";

const FONT_STACKS = {
  default: "Inter, ui-sans-serif, system-ui, sans-serif",
  sans: "ui-sans-serif, system-ui, sans-serif",
  arial: "Arial, Helvetica, sans-serif"
};
const COLOR_FIELDS = {
  appBackground: "Application background",
  appText: "Application text",
  inputBackground: "Input background",
  inputText: "Input text",
  outputBackground: "Output background",
  outputText: "Output text",
  buttonBackground: "Primary button",
  buttonText: "Primary button text",
  secondaryButtonBackground: "Secondary button",
  secondaryButtonText: "Secondary button text"
};

function displayShortcut(shortcut) {
  return shortcut.replace("Control", "Ctrl");
}

function applyAppearance(settings, theme = document.documentElement.dataset.theme) {
  if (!settings) return;
  const colors = settings.themes[theme];
  const root = document.documentElement.style;
  root.setProperty("--page", colors.appBackground);
  root.setProperty("--text", colors.appText);
  root.setProperty("--input-bg", colors.inputBackground);
  root.setProperty("--input-text", colors.inputText);
  root.setProperty("--result", colors.outputBackground);
  root.setProperty("--result-text", colors.outputText);
  root.setProperty("--button-bg", colors.buttonBackground);
  root.setProperty("--button-text", colors.buttonText);
  root.setProperty("--secondary-button-bg", colors.secondaryButtonBackground);
  root.setProperty("--secondary-button-text", colors.secondaryButtonText);
  root.setProperty("--font-family", FONT_STACKS[settings.font] || FONT_STACKS.default);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  themeIcon.textContent = dark ? "☀" : "☾";
  themeToggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  applyAppearance(appSettings, theme);
}

const savedTheme = localStorage.getItem("theme");
applyTheme(savedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

function renderColorSettings() {
  const container = document.querySelector("#colorSettings");
  container.replaceChildren();
  for (const [key, label] of Object.entries(COLOR_FIELDS)) {
    const control = document.createElement("label");
    control.className = "color-control";
    const name = document.createElement("span");
    const input = document.createElement("input");
    name.textContent = label;
    input.type = "color";
    input.value = settingsDraft.themes[paletteTheme][key];
    input.dataset.colorKey = key;
    input.addEventListener("input", () => {
      settingsDraft.themes[paletteTheme][key] = input.value;
      if (paletteTheme === document.documentElement.dataset.theme) applyAppearance(settingsDraft);
    });
    control.append(name, input);
    container.append(control);
  }
  document.querySelectorAll(".theme-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.palette === paletteTheme);
  });
}

function openSettings() {
  settingsDraft = structuredClone(appSettings);
  paletteTheme = document.documentElement.dataset.theme;
  fontSelect.value = settingsDraft.font;
  shortcutInput.value = displayShortcut(settingsDraft.shortcut);
  settingsStatus.textContent = "";
  renderColorSettings();
  settingsDialog.showModal();
}

function closeSettings({ restore = true } = {}) {
  if (restore) applyAppearance(appSettings);
  settingsDialog.close();
}

function shortcutFromEvent(event) {
  const modifiers = [];
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key.toUpperCase();
  if (["CONTROL", "ALT", "SHIFT", "META"].includes(key)) return null;
  if (!/^[A-Z0-9]$/.test(key) && !/^F(?:[1-9]|1[0-2])$/.test(key)) return null;
  if (!modifiers.length) return null;
  return [...modifiers, key].join("+");
}

async function refreshHistory() {
  const items = await window.transwords.getHistory();
  document.querySelector("#historyCount").textContent = items.length;
  const list = document.querySelector("#historyList");
  list.replaceChildren();
  if (!items.length) {
    list.innerHTML = '<p class="empty">Your translations will appear here.</p>';
    return;
  }
  for (const item of items) {
    const card = document.createElement("button");
    card.className = "history-card";
    const title = document.createElement("strong");
    const answer = document.createElement("span");
    const meta = document.createElement("small");
    title.textContent = item.source;
    answer.textContent = item.results.join(" · ");
    meta.textContent = `${item.provider} · ${new Date(item.createdAt).toLocaleString()}`;
    card.append(title, answer, meta);
    card.addEventListener("click", () => {
      showTranslator();
      source.value = item.source;
      showResult(item);
    });
    list.append(card);
  }
}

function showResult(item) {
  currentResult = item.results;
  provider.textContent = item.provider;
  const turengLink = document.querySelector("#turengLink");
  if (item.turengUrl) {
    turengLink.dataset.url = item.turengUrl;
    turengLink.classList.remove("hidden");
  } else {
    turengLink.classList.add("hidden");
  }
  translations.replaceChildren();
  item.results.forEach((value) => {
    const line = document.createElement("p");
    line.textContent = value;
    translations.append(line);
  });
  result.classList.remove("hidden");
}

async function runTranslation(text = source.value) {
  source.value = text.trim();
  if (!source.value) { status.textContent = "Enter or copy text first."; return; }
  translateButton.disabled = true;
  result.classList.add("hidden");
  status.textContent = "";
  loading.classList.remove("hidden");
  try {
    const item = await window.transwords.translate(source.value);
    showResult(item);
    status.textContent = item.warning ? "Tureng could not be reached; showing a fallback translation." : "";
    await refreshHistory();
  } catch (error) {
    status.textContent = error.message || "Translation failed. Check your connection and try again.";
  } finally {
    loading.classList.add("hidden");
    translateButton.disabled = false;
  }
}

function showTranslator() {
  document.querySelector("#translatorView").classList.remove("hidden");
  document.querySelector("#historyView").classList.add("hidden");
}

translateButton.addEventListener("click", () => runTranslation());
source.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    runTranslation();
  }
});
themeToggle.addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", theme);
  applyTheme(theme);
});
document.querySelector("#settingsToggle").addEventListener("click", openSettings);
document.querySelector("#closeSettings").addEventListener("click", () => closeSettings());
settingsDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeSettings(); });
document.querySelectorAll(".theme-tab").forEach((tab) => tab.addEventListener("click", () => {
  paletteTheme = tab.dataset.palette;
  renderColorSettings();
}));
fontSelect.addEventListener("change", () => {
  settingsDraft.font = fontSelect.value;
  applyAppearance(settingsDraft);
});
shortcutInput.addEventListener("keydown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  const shortcut = shortcutFromEvent(event);
  if (!shortcut) {
    settingsStatus.textContent = "Use Ctrl, Alt, or Shift with a letter, number, or F1–F12.";
    return;
  }
  settingsDraft.shortcut = shortcut;
  shortcutInput.value = displayShortcut(shortcut);
  settingsStatus.textContent = "";
});
document.querySelector("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  settingsDraft.font = fontSelect.value;
  settingsStatus.textContent = "Saving…";
  try {
    appSettings = await window.transwords.saveSettings(settingsDraft);
    applyAppearance(appSettings);
    closeSettings({ restore: false });
  } catch (error) {
    settingsStatus.textContent = String(error.message || error).replace(/^Error invoking remote method '[^']+':\s*/, "");
  }
});
document.querySelector("#resetSettings").addEventListener("click", async () => {
  settingsStatus.textContent = "Restoring defaults…";
  try {
    appSettings = await window.transwords.resetSettings();
    settingsDraft = structuredClone(appSettings);
    fontSelect.value = appSettings.font;
    shortcutInput.value = displayShortcut(appSettings.shortcut);
    renderColorSettings();
    applyAppearance(appSettings);
    settingsStatus.textContent = "Defaults restored.";
  } catch (error) {
    settingsStatus.textContent = error.message || "Could not restore defaults.";
  }
});
document.querySelector("#paste").addEventListener("click", async () => runTranslation(await window.transwords.readClipboard()));
document.querySelector("#copyResult").addEventListener("click", () => window.transwords.copy(currentResult.join("\n")));
document.querySelector("#turengLink").addEventListener("click", (event) => window.transwords.openExternal(event.currentTarget.dataset.url));
document.querySelector("#historyToggle").addEventListener("click", () => {
  document.querySelector("#translatorView").classList.toggle("hidden");
  document.querySelector("#historyView").classList.toggle("hidden");
});
document.querySelector("#clearHistory").addEventListener("click", async () => {
  if (confirm("Clear all saved translations?")) { await window.transwords.clearHistory(); await refreshHistory(); }
});
window.transwords.onShortcut((payload) => {
  showTranslator();
  if (payload.error) {
    status.textContent = payload.error;
    source.focus();
    return;
  }
  runTranslation(payload.text);
});
async function initialize() {
  appSettings = await window.transwords.getSettings();
  applyTheme(document.documentElement.dataset.theme);
  await refreshHistory();
}

initialize();
