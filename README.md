# TransWords

A free, open-source **English ↔ Turkish desktop translator** for Windows.

Highlight any text in any application and press **`Ctrl+T`** — TransWords copies the selection, comes to the front, and translates it instantly.

- **Single words** are looked up in the [Tureng](https://tureng.com) dictionary (through a background browser, so Cloudflare does not block it) and show multiple EN↔TR pairs.
- **Sentences and phrases** are translated with Google Translate.
- If Tureng cannot be reached, the app falls back to Google and still gives you a direct “View on Tureng” link.
- Translations are saved to a local **history** (last 500 entries) you can reopen at any time.

No account, no API key, no configuration needed — just download the `.exe` and translate.

---

## 📥 Download

| Who you are | What to get |
|---|---|
| **Regular user** | **[⬇️ Download TransWords-win32-x64.zip](https://github.com/Fevzierenn/TransWords/releases/latest)** — download, extract, run |
| **Developer** | Clone the repo, then `npm install` + `npm run dev` |

### ✅ Recommended: download the app (ZIP)

TransWords is an Electron app — the `.exe` **cannot run by itself**. It needs the
whole `TransWords-win32-x64` folder (Electron runtime, `resources\`, DLLs)
next to it. That is why you download a **ZIP**, not a bare `.exe`.

1. Open the **[Releases page](https://github.com/Fevzierenn/TransWords/releases/latest)**.
2. Under **Assets**, click **`TransWords-win32-x64.zip`** to download it (~150 MB).
3. **Extract** the ZIP anywhere (e.g. Desktop or `C:\Program Files`).
4. Open the extracted `TransWords-win32-x64` folder and double-click **`TransWords.exe`**.

> **Note:** An internet connection is required at runtime — TransWords looks up translations online.

**If Windows SmartScreen blocks it:** the app is not code-signed yet, so click **More info → Run anyway**.

> **Do not** download or commit `dist/` into git. GitHub rejects files over 100 MB in a repository (`TransWords.exe` alone is ~210 MB). The ZIP lives on the **Releases** page instead.

**If you cloned the source ZIP instead:** the built app is not inside the repository. Grab the ZIP from the [Releases page](https://github.com/Fevzierenn/TransWords/releases/latest), or build it yourself with `npm.cmd install` then `npm.cmd run build:win` — the result is `dist\TransWords-win32-x64\` (with `TransWords.exe` inside).

---

### Alternative: run from source (developers)

Only needed if you want to modify the code. Requires [Node.js](https://nodejs.org) 22+ and Windows 10/11 (x64):

```powershell
npm.cmd install
npm.cmd run dev
```

To rebuild the `.exe` yourself:

```powershell
npm.cmd run build:win
```

The packaged app is written to `dist\TransWords-win32-x64\` (with `TransWords.exe` inside) and zipped to `dist\TransWords-win32-x64\TransWords-win32-x64.zip` for uploading to a GitHub Release.

---

## How to use

| Action | How |
|---|---|
| Translate typed/pasted text | Type in the box, press **`Enter`** or click **Translate** |
| Insert a newline | **`Shift+Enter`** |
| Translate selected text from any app | Select text anywhere → press **`Ctrl+T`** (configurable) |
| Paste from clipboard | Click **Paste** |
| Copy the result | Click **Copy** |
| Open the dictionary page | Click **View on Tureng** (word results) |
| Switch light/dark theme | Moon/sun button in the top-right — remembered across restarts |
| View past translations | **History** button; click a card to reload it, or **Clear all** |
| Customize the app | **Settings** (⚙): fonts, colors, and a new global shortcut |

### Settings

Open **Settings** to:

- Record a **new global shortcut** (must include Ctrl/Alt/Shift + a letter, number, or F-key).
- Pick a **font**: Default, Sans Serif, or Arial.
- Customize **10 colors per theme** (light and dark separately): app background/text, input, output, primary buttons, secondary buttons — with live preview.
- **Restore defaults** at any time.

Settings and history persist across restarts.

---

## Where your data is stored

Everything stays **on your computer** — nothing is synced to a server:

| Data | Location (Windows) |
|---|---|
| Translation history | `%APPDATA%\transwords\history.json` (max 500 entries) |
| Settings | `%APPDATA%\transwords\settings.json` |
| Theme choice | Inside the app (localStorage) |
| Tureng session cookies | Electron profile data (used to pass Cloudflare) |

To reset everything, delete those two JSON files (or use **Clear all** / **Restore defaults** in the app).

---

## For developers

```powershell
npm.cmd install       # install dependencies
npm.cmd run dev       # start the app in development mode
npm.cmd start         # same as dev
npm.cmd test          # run unit tests (node --test, 9 tests)
npm.cmd run lint      # syntax-check all source files
npm.cmd run build:win # package Windows x64 build + zip into dist\
```

### Project layout

```
src/
  main.js                 Electron main process (window, IPC, global shortcut, persistence)
  preload.js              Secure contextBridge API exposed to the UI
  renderer/               UI: index.html, app.js, styles.css
  services/
    translator.js         Word vs. sentence routing, Google Translate, Tureng HTML parsing
    tureng-browser.js     Hidden-browser Tureng scraper (Cloudflare-friendly)
    selection-capture.js  Ctrl+T selection copy flow (nut-js)
    settings.js           Settings defaults, validation, shortcut normalization
scripts/                  Icon generation, Windows packaging, smoke tests
test/                     Unit tests (node:test)
media/                    Logo, icons, loading animation
dist/                     Packaged app output + release zip (gitignored)
```

### Manual smoke tests (need network)

```powershell
node scripts\sentence-smoke.js          # Google sentence route
node scripts\tureng-smoke.js kelime     # Tureng word route
npx.cmd electron scripts\ui-smoke.js    # UI screenshots (light/dark/settings/loading)
```

---

## Good to know

- **No API keys or environment variables.** Translation uses free, unofficial endpoints (`translate.googleapis.com` and scraped `tureng.com` pages). If either service changes its format, translation may break — word lookup already falls back to Google automatically.
- **`Ctrl+T` briefly steals focus**, because it simulates a copy command to capture your selection. If the shortcut conflicts with another app, change it in Settings (the app warns you if registration fails).
- **GPU acceleration is disabled** on purpose for Windows stability.
- This project targets **Windows x64**; `npm run dev` may work on macOS/Linux, but only the Windows build script is provided.
- Not affiliated with or endorsed by Tureng or Google.

## License

No license file is included yet — all rights reserved by the author by default. Contact the maintainer before redistributing.
