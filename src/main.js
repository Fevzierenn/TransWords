const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, nativeImage, net, shell } = require("electron");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { translate } = require("./services/translator");
const { translateWordInBrowser } = require("./services/tureng-browser");
const { captureSelectedText } = require("./services/selection-capture");
const { DEFAULT_SETTINGS, mergeSettings, normalizeShortcut } = require("./services/settings");

// Some Windows environments cannot start Electron's GPU child process. Use
// Chromium's software rendering so the desktop app can start reliably.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("in-process-gpu");

let mainWindow;
let keyboardAutomation;
let settings = DEFAULT_SETTINGS;
let activeShortcut;
const historyPath = () => path.join(app.getPath("userData"), "history.json");
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");

async function readHistory() {
  try {
    return JSON.parse(await fs.readFile(historyPath(), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    console.error("Could not read history:", error);
    return [];
  }
}

async function saveHistory(items) {
  await fs.mkdir(path.dirname(historyPath()), { recursive: true });
  await fs.writeFile(historyPath(), JSON.stringify(items.slice(0, 500), null, 2));
}

async function readSettings() {
  try {
    return mergeSettings(JSON.parse(await fs.readFile(settingsPath(), "utf8")));
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Could not read settings:", error);
    return mergeSettings();
  }
}

async function writeSettings(value) {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(value, null, 2));
}

async function handleSelectionShortcut() {
  let payload;
  try {
    const { keyboard, Key } = await keyboardAutomation;
    payload = { text: await captureSelectedText({ clipboard, keyboard, Key }) };
  } catch (error) {
    payload = { error: error.message || "Could not copy the selected text." };
  }
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("shortcut-translate", payload);
}

function registerSelectionShortcut(shortcut) {
  const normalized = normalizeShortcut(shortcut);
  const previous = activeShortcut;
  if (previous) globalShortcut.unregister(previous);
  if (!globalShortcut.register(normalized, handleSelectionShortcut)) {
    if (previous) globalShortcut.register(previous, handleSelectionShortcut);
    throw new Error(`The shortcut ${normalized} is already used by another application.`);
  }
  activeShortcut = normalized;
  return normalized;
}

async function performTranslation(text) {
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Enter or copy text to translate");
  let translated;
  if (!/\s/.test(clean)) {
    try {
      translated = await translateWordInBrowser(clean, BrowserWindow);
    } catch {
      translated = await translate(clean, net.fetch);
    }
  } else {
    translated = await translate(clean, net.fetch);
  }
  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    source: clean,
    results: translated.results,
    provider: translated.provider,
    turengUrl: translated.turengUrl,
    warning: translated.warning,
    createdAt: new Date().toISOString()
  };
  const history = await readHistory();
  await saveHistory([item, ...history.filter((old) => old.source !== clean)]);
  return item;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 840,
    height: 680,
    minWidth: 620,
    minHeight: 500,
    backgroundColor: "#f7f5ef",
    icon: nativeImage.createFromBuffer(fsSync.readFileSync(path.join(__dirname, "..", "media", "app-icon.png"))),
    title: "TransWords",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(async () => {
  keyboardAutomation = import("@nut-tree-fork/nut-js");
  settings = await readSettings();
  registerSelectionShortcut(settings.shortcut);
  createWindow();
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle("translate", (_event, text) => performTranslation(text));
ipcMain.handle("history:get", () => readHistory());
ipcMain.handle("history:clear", async () => { await saveHistory([]); return []; });
ipcMain.handle("clipboard:read", () => clipboard.readText());
ipcMain.handle("clipboard:write", (_event, text) => clipboard.writeText(String(text || "")));
ipcMain.handle("external:open", (_event, url) => {
  if (!String(url).startsWith("https://tureng.com/")) throw new Error("Unsupported link");
  return shell.openExternal(url);
});
ipcMain.handle("settings:get", () => settings);
ipcMain.handle("settings:save", async (_event, value) => {
  const next = mergeSettings(value);
  next.shortcut = registerSelectionShortcut(value.shortcut);
  await writeSettings(next);
  settings = next;
  return settings;
});
ipcMain.handle("settings:reset", async () => {
  const next = mergeSettings();
  next.shortcut = registerSelectionShortcut(next.shortcut);
  await writeSettings(next);
  settings = next;
  return settings;
});
