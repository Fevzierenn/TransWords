const TUReng_ORIGIN = "https://tureng.com";

function turengUrlFor(text) {
  return `${TUReng_ORIGIN}/tr/turkce-ingilizce/${encodeURIComponent(text)}`;
}

const SCRAPE_SCRIPT = `(() => {
  const selectors = [
    '#englishResultsTable tr',
    '#turkishResultsTable tr',
    'table.searchResultsTable tr'
  ];
  const rows = document.querySelectorAll(selectors.join(','));
  const results = [];
  for (const row of rows) {
    const cells = [...row.querySelectorAll('td')]
      .map((cell) => cell.innerText.replace(/\\s+/g, ' ').trim())
      .filter(Boolean)
      .filter((cell) => !/^\\d+\\.?$/.test(cell));
    if (cells.length < 3) continue;
    const source = cells.at(-2);
    const translation = cells.at(-1);
    if (source && translation && source !== translation) {
      const value = source + ' — ' + translation;
      if (!results.includes(value)) results.push(value);
    }
    if (results.length >= 8) break;
  }
  return { results, title: document.title, url: location.href };
})()`;

async function translateWordInBrowser(text, BrowserWindow, options = {}) {
  const url = turengUrlFor(text);
  const timeoutMs = options.timeoutMs || 18000;
  const worker = new BrowserWindow({
    show: false,
    width: 900,
    height: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: "persist:transwords-tureng"
    }
  });
  worker.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  return new Promise((resolve, reject) => {
    let finished = false;
    let polling;
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearInterval(polling);
      clearTimeout(timeout);
      if (!worker.isDestroyed()) worker.destroy();
      if (error) reject(error); else resolve(value);
    };
    const inspect = async () => {
      if (worker.isDestroyed() || worker.webContents.isLoadingMainFrame()) return;
      try {
        const page = await worker.webContents.executeJavaScript(SCRAPE_SCRIPT, true);
        if (page.results.length) {
          finish(null, { provider: "Tureng", results: page.results, turengUrl: url });
        }
      } catch {
        // Navigation during Cloudflare's browser check is expected; poll again.
      }
    };
    const timeout = setTimeout(
      () => finish(new Error("Tureng browser lookup timed out")),
      timeoutMs
    );
    polling = setInterval(inspect, 750);
    worker.webContents.on("did-finish-load", inspect);
    worker.webContents.on("render-process-gone", () => finish(new Error("Tureng browser process stopped")));
    worker.loadURL(url).catch(() => {});
  });
}

module.exports = { translateWordInBrowser, turengUrlFor };
