const { app, net } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { translateSentence } = require("../src/services/translator");

const output = path.join(__dirname, "sentence-smoke-result.json");
const keepAlive = setInterval(() => {}, 1000);

app.whenReady().then(async () => {
  try {
    const queries = ["How are you today?", "Bugün nasılsın?"];
    const results = [];
    for (const query of queries) results.push(await translateSentence(query, net.fetch));
    fs.writeFileSync(output, JSON.stringify({ status: "ok", results }, null, 2));
    clearInterval(keepAlive);
    app.exit(0);
  } catch (error) {
    fs.writeFileSync(output, JSON.stringify({
      status: "error",
      message: error.message,
      cause: error.cause?.message
    }, null, 2));
    clearInterval(keepAlive);
    app.exit(1);
  }
});
