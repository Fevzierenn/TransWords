const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SETTINGS } = require("../src/services/settings");

const lightOutput = path.join(__dirname, "ui-smoke-light.png");
const darkOutput = path.join(__dirname, "ui-smoke-dark.png");
const resultOutput = path.join(__dirname, "ui-smoke-result.json");
const settingsOutput = path.join(__dirname, "settings-smoke.png");
const loadingOutput = path.join(__dirname, "loading-smoke.png");
const keepAlive = setInterval(() => {}, 1000);

ipcMain.handle("history:get", () => []);
ipcMain.handle("clipboard:read", () => "");
ipcMain.handle("clipboard:write", () => undefined);
ipcMain.handle("external:open", () => undefined);
ipcMain.handle("settings:get", () => DEFAULT_SETTINGS);
ipcMain.handle("settings:save", (_event, settings) => settings);
ipcMain.handle("settings:reset", () => DEFAULT_SETTINGS);
ipcMain.handle("translate", async (_event, source) => {
  await new Promise((resolve) => setTimeout(resolve, 1800));
  return {
    source,
    provider: "Test provider",
    results: ["Test translation"],
    createdAt: new Date().toISOString()
  };
});

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 840,
    height: 680,
    backgroundColor: "#f7f5ef",
    webPreferences: {
      preload: path.join(__dirname, "..", "src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  await window.loadFile(path.join(__dirname, "..", "src", "renderer", "index.html"));
  await new Promise((resolve) => setTimeout(resolve, 500));
  const keyboard = await window.webContents.executeJavaScript(`(() => {
    const source = document.querySelector('#source');
    source.value = 'Hello world';
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    const enterAllowed = source.dispatchEvent(enter);
    const shiftEnter = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
    const shiftEnterAllowed = source.dispatchEvent(shiftEnter);
    return { enterAllowed, shiftEnterAllowed };
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  fs.writeFileSync(resultOutput, JSON.stringify(keyboard, null, 2));
  const loadingImage = await window.webContents.capturePage();
  fs.writeFileSync(loadingOutput, loadingImage.toPNG());
  await new Promise((resolve) => setTimeout(resolve, 1800));
  await window.webContents.executeJavaScript("document.documentElement.dataset.theme = 'light'");
  const lightImage = await window.webContents.capturePage();
  fs.writeFileSync(lightOutput, lightImage.toPNG());
  await window.webContents.executeJavaScript("document.querySelector('#themeToggle').click()");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const darkImage = await window.webContents.capturePage();
  fs.writeFileSync(darkOutput, darkImage.toPNG());
  await window.webContents.executeJavaScript("document.querySelector('#settingsToggle').click()");
  await new Promise((resolve) => setTimeout(resolve, 300));
  const settingsImage = await window.webContents.capturePage();
  fs.writeFileSync(settingsOutput, settingsImage.toPNG());
  clearInterval(keepAlive);
  app.exit(0);
});
