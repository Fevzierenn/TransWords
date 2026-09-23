const { splitPair, shortcutKeys, displayShortcut, relativeTime, matchesQuery } = window.TransWordsFormat;
const $ = (selector) => document.querySelector(selector);

const source = $("#source");
const status = $("#status");
const translations = $("#translations");
const provider = $("#provider");
const translateButton = $("#translate");
const themeToggle = $("#themeToggle");
const themeIcon = $("#themeIcon");
const settingsDialog = $("#settingsDialog");
const confirmDialog = $("#confirmDialog");
const shortcutInput = $("#shortcutInput");
const fontSelect = $("#fontSelect");
const settingsStatus = $("#settingsStatus");
const historySearch = $("#historySearch");
const RESULT_STATES = { empty: "#emptyState", loading: "#loading", error: "#errorState", result: "#result" };
let currentResult = [];
let historyItems = [];
let appSettings;
let settingsDraft;
let paletteTheme = "light";
let lastRequestedText = "";
let requestId = 0;
let toastTimer;

const FONT_STACKS = {
  default: "\"Segoe UI Variable Text\", \"Segoe UI\", Inter, system-ui, sans-serif",
  sans: "ui-sans-serif, system-ui, sans-serif",
  arial: "Arial, Helvetica, sans-serif"
};
const COLOR_FIELDS = {
  appBackground: "App background",
  appText: "App text",
  inputBackground: "Input background",
  inputText: "Input text",
  outputBackground: "Output background",
  outputText: "Output text",
  buttonBackground: "Primary button",
  buttonText: "Primary button text",
  secondaryButtonBackground: "Secondary button",
  secondaryButtonText: "Secondary button text"
};

function icon(name, className = "icon") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  svg.setAttribute("class", className);
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

function showToast(message, { error = false } = {}) {
  const toast = $("#toast");
  toast.replaceChildren(icon(error ? "alert" : "check"), message);
  toast.classList.toggle("error", error);
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

function renderKeys(container, shortcut) {
  container.replaceChildren();
  shortcutKeys(shortcut).forEach((key, index) => {
    if (index) container.append("+");
    const kbd = document.createElement("kbd");
    kbd.textContent = key;
    container.append(kbd);
  });
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
  themeIcon.setAttribute("href", dark ? "#i-sun" : "#i-moon");
  themeToggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  applyAppearance(appSettings, theme);
}

const savedTheme = localStorage.getItem("theme");
applyTheme(savedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

// ---- Views ----

function showView(view) {
  const history = view === "history";
  $("#translatorView").classList.toggle("hidden", history);
  $("#historyView").classList.toggle("hidden", !history);
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  if (history) historySearch.focus();
  else source.focus();
}

function showTranslator() {
  showView("translator");
}

// ---- Translator ----

function setResultState(state) {
  for (const [name, selector] of Object.entries(RESULT_STATES)) {
    $(selector).classList.toggle("hidden", name !== state);
  }
  $("#resultActions").classList.toggle("hidden", state !== "result");
  provider.classList.toggle("hidden", state !== "result");
}

function updateSourceMeta() {
  const length = source.value.length;
  $("#charCount").textContent = `${length} character${length === 1 ? "" : "s"}`;
  $("#clearSource").classList.toggle("hidden", !length);
}

function copyText(text, message = "Copied to clipboard") {
  window.transwords.copy(text);
  showToast(message);
}

function renderTranslations(results) {
  translations.replaceChildren();
  const pairs = results.map(splitPair);
  if (!pairs.some((pair) => pair.term)) {
    const sentence = document.createElement("p");
    sentence.className = "sentence";
    sentence.textContent = results.join("\n");
    translations.append(sentence);
    return;
  }
  const list = document.createElement("ol");
  list.className = "pairs";
  for (const pair of pairs) {
    const row = document.createElement("li");
    row.className = "pair";
    const term = document.createElement("span");
    const translation = document.createElement("span");
    const copy = document.createElement("button");
    term.className = "term";
    translation.className = "translation";
    term.textContent = pair.term;
    translation.textContent = pair.translation;
    copy.type = "button";
    copy.className = "icon-btn small";
    copy.title = `Copy “${pair.translation}”`;
    copy.setAttribute("aria-label", copy.title);
    copy.append(icon("copy"));
    copy.addEventListener("click", () => copyText(pair.translation));
    row.append(term, translation, copy);
    list.append(row);
  }
  translations.append(list);
}

function showResult(item) {
  currentResult = item.results;
  provider.textContent = item.provider;
  const turengLink = $("#turengLink");
  turengLink.dataset.url = item.turengUrl || "";
  turengLink.classList.toggle("hidden", !item.turengUrl);
  $("#warning").classList.toggle("hidden", !item.warning);
  renderTranslations(item.results);
  setResultState("result");
}

function showError(message) {
  status.textContent = message;
  setResultState("error");
}

async function runTranslation(text = source.value) {
  source.value = text.trim();
  updateSourceMeta();
  if (!source.value) {
    showToast("Type or paste some text first", { error: true });
    source.focus();
    return;
  }
  const id = ++requestId;
  lastRequestedText = source.value;
  translateButton.disabled = true;
  setResultState("loading");
  try {
    const item = await window.transwords.translate(source.value);
    if (id !== requestId) return;
    showResult(item);
    await refreshHistory();
  } catch (error) {
    if (id !== requestId) return;
    showError(cleanIpcError(error) || "Check your internet connection and try again.");
  } finally {
    if (id === requestId) translateButton.disabled = false;
  }
}

// ---- History ----

function renderHistory() {
  const count = $("#historyCount");
  count.textContent = historyItems.length;
  count.toggleAttribute("data-zero", !historyItems.length);
  $("#clearHistory").disabled = !historyItems.length;
  const list = $("#historyList");
  list.replaceChildren();
  const visible = historyItems.filter((item) => matchesQuery(item, historySearch.value));
  if (!visible.length) {
    const empty = document.createElement("li");
    empty.className = "history-empty";
    const title = document.createElement("strong");
    const hint = document.createElement("span");
    if (historyItems.length) {
      title.textContent = "No matches";
      hint.textContent = "Try a different search term.";
    } else {
      title.textContent = "No translations yet";
      hint.textContent = "Everything you translate is saved here, on this computer only.";
    }
    empty.append(icon("history", "state-icon"), title, hint);
    list.append(empty);
    return;
  }
  for (const item of visible) {
    const row = document.createElement("li");
    row.className = "history-item";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "history-open";
    const title = document.createElement("strong");
    const preview = document.createElement("span");
    const meta = document.createElement("small");
    const providerChip = document.createElement("span");
    const time = document.createElement("time");
    title.textContent = item.source;
    preview.className = "preview";
    preview.textContent = item.results.map((value) => splitPair(value).translation).join(" · ");
    providerChip.className = "chip";
    providerChip.textContent = item.provider;
    time.dateTime = item.createdAt;
    time.title = new Date(item.createdAt).toLocaleString();
    time.textContent = relativeTime(item.createdAt);
    meta.append(providerChip, time);
    open.append(title, preview, meta);
    open.addEventListener("click", () => {
      showTranslator();
      source.value = item.source;
      updateSourceMeta();
      showResult(item);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-btn small";
    remove.title = "Delete from history";
    remove.setAttribute("aria-label", `Delete “${item.source}” from history`);
    remove.append(icon("trash"));
    remove.addEventListener("click", async () => {
      historyItems = await window.transwords.deleteHistoryItem(item.id);
      renderHistory();
    });
    row.append(open, remove);
    list.append(row);
  }
}

async function refreshHistory() {
  historyItems = await window.transwords.getHistory();
  renderHistory();
}

// ---- Settings ----

function renderColorSettings() {
  const container = $("#colorSettings");
  container.replaceChildren();
  for (const [key, label] of Object.entries(COLOR_FIELDS)) {
    const control = document.createElement("label");
    control.className = "color-control";
    const name = document.createElement("span");
    const hex = document.createElement("code");
    const input = document.createElement("input");
    name.textContent = label;
    input.type = "color";
    input.value = settingsDraft.themes[paletteTheme][key];
    input.dataset.colorKey = key;
    hex.textContent = input.value;
    input.addEventListener("input", () => {
      settingsDraft.themes[paletteTheme][key] = input.value;
      hex.textContent = input.value;
      if (paletteTheme === document.documentElement.dataset.theme) applyAppearance(settingsDraft);
    });
    control.append(input, name, hex);
    container.append(control);
  }
  document.querySelectorAll(".theme-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.palette === paletteTheme);
  });
}

function setSettingsStatus(message, { ok = false } = {}) {
  settingsStatus.textContent = message;
  settingsStatus.classList.toggle("ok", ok);
}

function openSettings() {
  settingsDraft = structuredClone(appSettings);
  paletteTheme = document.documentElement.dataset.theme;
  fontSelect.value = settingsDraft.font;
  shortcutInput.value = displayShortcut(settingsDraft.shortcut);
  setSettingsStatus("");
  renderColorSettings();
  settingsDialog.showModal();
}

function closeSettings({ restore = true } = {}) {
  if (restore) applyAppearance(appSettings);
  settingsDialog.close();
}

function applySettings(settings) {
  appSettings = settings;
  applyAppearance(appSettings);
  renderKeys($("#shortcutTip"), appSettings.shortcut);
}

function shortcutFromEvent(event) {
  const modifiers = [];
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  const key = event.key.toUpperCase();
  if (["CONTROL", "ALT", "SHIFT", "META"].includes(key)) return null;
  if (!/^[A-Z0-9]$/.test(key) && !/^F(?:[1-9]|1[0-2])$/.test(key)) return null;
  if (!modifiers.length) return null;
  return [...modifiers, key].join("+");
}

function cleanIpcError(error) {
  return String(error.message || error).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, "");
}

// ---- Events ----

translateButton.addEventListener("click", () => runTranslation());
$("#retry").addEventListener("click", () => runTranslation(lastRequestedText || source.value));
source.addEventListener("input", updateSourceMeta);
source.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    runTranslation();
  }
});
$("#clearSource").addEventListener("click", () => {
  source.value = "";
  updateSourceMeta();
  setResultState("empty");
  source.focus();
});
$("#paste").addEventListener("click", async () => runTranslation(await window.transwords.readClipboard()));
$("#copyResult").addEventListener("click", () => copyText(currentResult.map((value) => splitPair(value).translation).join("\n")));
$("#turengLink").addEventListener("click", (event) => window.transwords.openExternal(event.currentTarget.dataset.url));

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
historySearch.addEventListener("input", renderHistory);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#historyView").classList.contains("hidden") && !document.querySelector("dialog[open]")) {
    showTranslator();
  }
});
$("#clearHistory").addEventListener("click", () => confirmDialog.showModal());
confirmDialog.addEventListener("close", async () => {
  if (confirmDialog.returnValue !== "confirm") return;
  await window.transwords.clearHistory();
  await refreshHistory();
  showToast("History cleared");
});

themeToggle.addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", theme);
  applyTheme(theme);
});
$("#settingsToggle").addEventListener("click", openSettings);
$("#closeSettings").addEventListener("click", () => closeSettings());
$("#cancelSettings").addEventListener("click", () => closeSettings());
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
  if (event.key === "Tab") return;
  event.preventDefault();
  event.stopPropagation();
  const shortcut = shortcutFromEvent(event);
  if (!shortcut) {
    setSettingsStatus("Use Ctrl, Alt, or Shift with a letter, number, or F1–F12.");
    return;
  }
  settingsDraft.shortcut = shortcut;
  shortcutInput.value = displayShortcut(shortcut);
  setSettingsStatus("");
});
$("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  settingsDraft.font = fontSelect.value;
  setSettingsStatus("Saving…", { ok: true });
  try {
    applySettings(await window.transwords.saveSettings(settingsDraft));
    closeSettings({ restore: false });
    showToast("Settings saved");
  } catch (error) {
    setSettingsStatus(cleanIpcError(error));
  }
});
$("#resetSettings").addEventListener("click", async () => {
  setSettingsStatus("Restoring defaults…", { ok: true });
  try {
    applySettings(await window.transwords.resetSettings());
    settingsDraft = structuredClone(appSettings);
    fontSelect.value = appSettings.font;
    shortcutInput.value = displayShortcut(appSettings.shortcut);
    renderColorSettings();
    setSettingsStatus("Defaults restored.", { ok: true });
  } catch (error) {
    setSettingsStatus(cleanIpcError(error) || "Could not restore defaults.");
  }
});

window.transwords.onShortcut((payload) => {
  showTranslator();
  if (payload.error) {
    showToast(payload.error, { error: true });
    source.focus();
    return;
  }
  runTranslation(payload.text);
});

async function initialize() {
  setResultState("empty");
  updateSourceMeta();
  applySettings(await window.transwords.getSettings());
  applyTheme(document.documentElement.dataset.theme);
  await refreshHistory();
}

initialize();
