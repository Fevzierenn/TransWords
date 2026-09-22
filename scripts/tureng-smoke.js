const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { translateWordInBrowser } = require("../src/services/tureng-browser");

const resultPath = path.join(__dirname, "tureng-smoke-result.json");
fs.writeFileSync(resultPath, JSON.stringify({
  status: "starting",
  electron: process.versions.electron,
  hasApp: Boolean(app),
  argv: process.argv
}));
const keepAlive = setInterval(() => {}, 1000);

app.on("ready", async () => {
  try {
    const result = await translateWordInBrowser(process.argv[2] || "book", BrowserWindow, {
      timeoutMs: 25000
    });
    console.log(`TURENG_SMOKE_OK=${JSON.stringify(result)}`);
    fs.writeFileSync(resultPath, JSON.stringify({ status: "ok", result }, null, 2));
    clearInterval(keepAlive);
    app.exit(0);
  } catch (error) {
    console.error(`TURENG_SMOKE_ERROR=${error.message}`);
    fs.writeFileSync(resultPath, JSON.stringify({ status: "error", error: error.message }, null, 2));
    clearInterval(keepAlive);
    app.exit(1);
  }
});
