// Renders the UI with mocked IPC and saves screenshots of each state to scripts/ui-smoke-output/.
// Run with: npx.cmd electron scripts\ui-smoke.js
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SETTINGS } = require("../src/services/settings");

const outputDir = path.join(__dirname, "ui-smoke-output");
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

let history = [
  { id: "1", source: "book", provider: "Tureng", results: ["book — kitap", "book — defter", "book — rezervasyon yapmak"], turengUrl: "https://tureng.com/tr/turkce-ingilizce/book", createdAt: minutesAgo(3) },
  { id: "2", source: "The weather is lovely today.", provider: "Google Translate", results: ["Bugün hava çok güzel."], createdAt: minutesAgo(90) },
  { id: "3", source: "güzel", provider: "Tureng", results: ["güzel — beautiful", "güzel — nice", "güzel — pretty"], turengUrl: "https://tureng.com/tr/turkce-ingilizce/g%C3%BCzel", createdAt: minutesAgo(60 * 26) }
];

ipcMain.handle("history:get", () => history);
ipcMain.handle("history:delete", (_event, id) => (history = history.filter((item) => item.id !== id)));
ipcMain.handle("history:clear", () => (history = []));
ipcMain.handle("clipboard:read", () => "");
ipcMain.handle("clipboard:write", () => undefined);
ipcMain.handle("external:open", () => undefined);
ipcMain.handle("settings:get", () => DEFAULT_SETTINGS);
ipcMain.handle("settings:save", (_event, settings) => settings);
ipcMain.handle("settings:reset", () => DEFAULT_SETTINGS);
ipcMain.handle("translate", async (_event, source) => {
  await wait(1200);
  if (source === "fail") throw new Error("Translation request failed (503)");
  if (!/\s/.test(source)) {
    return {
      id: "w", source, provider: "Tureng", createdAt: new Date().toISOString(),
      turengUrl: `https://tureng.com/tr/turkce-ingilizce/${source}`,
      results: ["hello — merhaba", "hello — selam", "hello — alo", "say hello — selam söylemek", "hello there — merhaba oradaki"]
    };
  }
  return { id: "s", source, provider: "Google Translate", results: ["Merhaba dünya, bugün nasılsın?"], createdAt: new Date().toISOString() };
});

app.whenReady().then(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const window = new BrowserWindow({
    show: false,
    width: 1000,
    height: 680,
    webPreferences: {
      preload: path.join(__dirname, "..", "src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const run = (script) => window.webContents.executeJavaScript(script);
  const shot = async (name) => {
    await wait(900);
    fs.writeFileSync(path.join(outputDir, `${name}.png`), (await window.webContents.capturePage()).toPNG());
  };
  const setTheme = (theme) => run(`(() => {
    if (document.documentElement.dataset.theme !== '${theme}') document.querySelector('#themeToggle').click();
  })()`);
  const translate = (text) => run(`(() => {
    const source = document.querySelector('#source');
    source.value = ${JSON.stringify(text)};
    return source.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  })()`);

  await window.loadFile(path.join(__dirname, "..", "src", "renderer", "index.html"));
  await wait(500);

  for (const theme of ["light", "dark"]) {
    await setTheme(theme);
    await run("document.querySelector('#translatorTab').click(); document.querySelector('#clearSource').click()");
    await shot(`${theme}-empty`);
    const enterAllowed = await translate("hello");
    await shot(`${theme}-loading`);
    await wait(600);
    await shot(`${theme}-word`);
    await translate("Hello world, how are you today?");
    await wait(1500);
    await shot(`${theme}-sentence`);
    await translate("fail");
    await wait(1500);
    await shot(`${theme}-error`);
    await run("document.querySelector('#historyToggle').click()");
    await shot(`${theme}-history`);
    await run("document.querySelector('#settingsToggle').click()");
    await shot(`${theme}-settings`);
    await run("document.querySelector('#closeSettings').click()");
    fs.writeFileSync(path.join(outputDir, "result.json"), JSON.stringify({ enterPreventedDefault: !enterAllowed }, null, 2));
  }

  await run("document.querySelector('#translatorTab').click()");
  await translate("hello");
  await wait(1500);
  window.setSize(560, 760);
  await shot("narrow");
  app.exit(0);
});
