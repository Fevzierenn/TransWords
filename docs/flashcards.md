# Flashcards

Flashcards turn the single words you have translated into practice cards. Opening the **Flashcards** tab starts a session: you see a word (or one of its meanings) and type the translation. Missed cards come back once at the end of the session, and a spaced-repetition schedule decides when each card is due again.

## Architecture

```
 Renderer (sandboxed)                          Main process
 ─────────────────────                         ─────────────────────────────────────────────
 src/renderer/flashcards.js                    src/services/flashcards-ipc.js  (registerFlashcards)
   opens on "transwords:view" ──session()──▶     flashcards:session ─┐
   shows prompt, reads answer                                        ├─ readHistory()      → history.json (read-only)
   ◀── verdict + accepted answers ──answer()──   flashcards:answer ──┤  buildCards / buildQuestions / pickSession
                                                                     │  checkAnswer (local)  ── wrong? ──▶ remote validator (optional)
                                                                     └─ scheduleReview     → flashcards.json (progress)
                                               src/services/flashcards.js        pure logic, unit-tested
                                               src/services/answer-validator.js  optional HTTP validator (placeholder)
```

- The **renderer never sees the answers** until it submits one; `flashcards:session` returns only prompts.
- Cards are **derived from history on every request**, so there is no second copy of your words to keep in sync. Deleting a word from History removes its card.
- Progress lives in its own file, `%APPDATA%\transwords\flashcards.json`. `history.json` and `settings.json` formats are unchanged apart from a new optional `flashcards` settings block.

## Data structures

```js
// Card: one per previously searched single word (sentences are skipped).
{ id: "love", word: "love", lang: "en", meanings: ["sevda", "aşk", "sevgi", "sevmek"] }

// Question: a card asked in one direction. Forward asks for the meaning, reverse shows a meaning.
{ key: "f|love", prompt: "love", from: "en", to: "tr", answers: ["sevda", "aşk", "sevgi", "sevmek"] }
{ key: "r|love", prompt: "sevda", from: "tr", to: "en", answers: ["love"] }

// flashcards.json → accepted[key]: answers you confirmed with "I was right".
{ "f|try": ["uğraşmak"] }

// Progress entry (flashcards.json → progress[key]): a Leitner box plus counters.
{ box: 3, due: "2026-09-26T10:00:00.000Z", correct: 4, wrong: 1, lastReviewed: "2026-09-23T10:00:00.000Z" }
```

## Algorithms

**Building cards** (`buildCards`)
1. Take history items whose source is a single word; dedupe by normalized word.
2. Split each Tureng row `"term — translation"` and keep only rows whose term *is* the searched word, so phrase rows such as `klima kurulumu — …` do not become answers for `kurulumu`.
3. Strip Tureng's part-of-speech tags (`i.` noun, `f.` verb, `s.` adjective) and dedupe the meanings.
4. **Language detection:** Tureng tags the *English* side of each row (`love i. — aşk`, `tutkunluk — passion i.`), so the tagged side tells us which language the word is in. Without tags (Google fallback results), Turkish letters decide; otherwise the word is treated as English.

**Directions** (`buildQuestions`): every card yields a forward and a reverse question. Mode `en-tr` keeps questions whose prompt is English, `tr-en` those whose prompt is Turkish, and `mixed` keeps both. A reverse question accepts *any* searched word that shares the prompted meaning.

**Checking answers** (`checkAnswer`), in order:
1. Normalize both sides: lowercase (Turkish `İ` handled), drop `( … )` notes and punctuation, and ignore a leading `to` / `a` / `an` / `the`. Each meaning also counts through its comma/semicolon/slash-separated parts.
2. Exact match → **correct**.
3. Match after folding Turkish letters (`ş→s`, `ı→i`, …) → **correct**, with a "mind the accents" hint. This covers typing on an English keyboard.
4. Levenshtein distance within the allowance (0 for ≤3 letters, 1 for ≤6, 2 otherwise) → **almost** (counted as correct, spelling shown).
5. **Same word root** (`wordRoot`) → **almost**, showing the full form. One common ending is stripped from the last word when at least 3 letters remain: Turkish `-mek/-mak`, `-me/-ma`, `-ler/-lar`; English `-ing`, `-ed`, `-es`, `-s`. The answer's language decides which list applies. So `dene` matches `deneme`, and `kitaplar` matches `kitap`.
6. **Your own accepted answers**: anything you confirmed with **I was right** for this question is checked like a dictionary meaning.
7. **Back-translation second chance** (on by default; Settings → "Check flashcard answers online"): the answer is translated back into the prompt's language with the Google endpoint the app already uses. If the result matches the prompt, it counts as **correct**, with a note such as “dene” translates back to “try”. Network errors or a 4-second timeout simply skip this step.
8. Otherwise → **wrong**; the optional remote validator may still accept it.

**I was right**: after a wrong verdict (not after "I don't know"), this button re-scores the review as correct. The previous progress is restored first, so the miss doesn't count. The answer is saved to `accepted[key]` in `flashcards.json`, so the app becomes more tolerant from your own corrections.

**Scheduling** (`scheduleReview`, Leitner system): a correct or "almost" answer moves the card up one box (max 5); a wrong answer or "I don't know" sends it to box 1. The next review is due after 0 / 1 / 3 / 7 / 14 days for boxes 1–5.

**Picking a session** (`pickSession`): due questions only, lowest box first, then oldest due date, with random tie-breaks. The session size comes from settings (default 10). When nothing is due, the page shows when the next review is and offers **Practice anyway**, which ignores due dates.

## Optional answer validation via an external API

Local checking handles exact matches, accents and typos, but not valid synonyms that Tureng did not list. For those, a remote validator can be consulted **only when the local verdict is "wrong"**. No specific API is assumed: `src/services/answer-validator.js` speaks a small, provider-neutral contract.

```
POST <endpoint>                    Authorization: Bearer <key from env var>   (only if set)
{ "prompt": "love", "answer": "muhabbet", "from": "en", "to": "tr", "expected": ["sevda", "aşk", "sevgi"] }
→ 200 { "correct": true, "feedback": "“muhabbet” is an accepted synonym." }
```

Any network error, timeout (5 s), non-2xx status, or malformed body returns `null`, and the local verdict stands. Flashcards never break because the API is down.

Integration steps:
1. Put a small HTTPS service in front of the provider you choose (for example an LLM, or a translation API used for back-translation). It must implement the contract above.
2. Set the key in an environment variable. It is never stored in files:
   `setx TRANSWORDS_VALIDATOR_KEY "<your key>"`
3. Enable it in `%APPDATA%\transwords\settings.json`:
   ```json
   "flashcards": {
     "enabled": true,
     "sessionSize": 10,
     "remoteValidation": { "enabled": true, "endpoint": "https://<your-validator>/check", "apiKeyEnv": "TRANSWORDS_VALIDATOR_KEY" }
   }
   ```
   Only `https://` endpoints are accepted, `sessionSize` is clamped to 5–30, and invalid values fall back to the defaults.
4. Restart TransWords. Remote verdicts appear with the validator's feedback text.

## Turning the feature off or removing it

- **Off:** Settings → Flashcards switch. This hides the tab, and nothing else changes.
- **Remove entirely:** delete `src/services/flashcards.js`, `flashcards-ipc.js`, `answer-validator.js`, `src/renderer/flashcards.js` and their tests. Remove the `registerFlashcards(...)` call from `main.js`, the `flashcards` object from `preload.js`, the tab, section and settings row from `index.html`, the `/* Flashcards */` CSS block, and the `flashcards` block in `settings.js`. Translation and history do not depend on any of it.
