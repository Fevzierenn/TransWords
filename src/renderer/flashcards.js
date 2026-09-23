// Flashcards view. Loaded after app.js and uses its shared helpers ($, showToast).
// A session starts when the Flashcards tab opens; answers are checked in the main process.
(() => {
  const LANGUAGE_NAMES = { en: "English", tr: "Turkish" };
  const fc = {
    card: $("#fcCard"),
    prompt: $("#fcPrompt"),
    direction: $("#fcDirection"),
    form: $("#fcForm"),
    answer: $("#fcAnswer"),
    submit: $("#fcSubmit"),
    reveal: $("#fcReveal"),
    override: $("#fcOverride"),
    feedback: $("#fcFeedback"),
    counter: $("#fcCounter"),
    bar: $("#fcProgressBar"),
    empty: $("#fcEmpty"),
    done: $("#fcDone")
  };
  let mode = "mixed";
  let queue = [];
  let index = 0;
  let firstTry = 0;
  let retried = new Set();
  let checking = false;
  let showingFeedback = false;
  let loading = false;

  function showPanel(panel) {
    for (const element of [fc.card, fc.empty, fc.done]) element.classList.toggle("hidden", element !== panel);
  }

  function updateProgress() {
    const total = queue.length;
    fc.counter.textContent = total ? `${Math.min(index + 1, total)} / ${total}` : "";
    fc.bar.style.width = total ? `${(index / total) * 100}%` : "0";
  }

  function relativeDue(iso) {
    const hours = Math.round((new Date(iso).getTime() - Date.now()) / 3600000);
    if (hours < 1) return "in less than an hour";
    if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
    const days = Math.round(hours / 24);
    return `in ${days} day${days === 1 ? "" : "s"}`;
  }

  function showEmpty(session) {
    const hasWords = session.questionCount > 0;
    $("#fcEmptyTitle").textContent = hasWords ? "All caught up!" : "No words to practice yet";
    $("#fcEmptyText").textContent = hasWords
      ? `Your next review is due ${relativeDue(session.nextDue)}. You can still practice now.`
      : "Translate a few single words and they will turn into flashcards here.";
    $("#fcPracticeAnyway").classList.toggle("hidden", !hasWords);
    fc.counter.textContent = hasWords ? `${session.wordCount} word${session.wordCount === 1 ? "" : "s"}` : "";
    fc.bar.style.width = "0";
    showPanel(fc.empty);
  }

  function showQuestion() {
    const question = queue[index];
    showingFeedback = false;
    fc.prompt.textContent = question.prompt;
    fc.direction.textContent = `${LANGUAGE_NAMES[question.from]} → ${LANGUAGE_NAMES[question.to]}`;
    fc.answer.value = "";
    fc.answer.readOnly = false;
    fc.answer.placeholder = `Type the ${LANGUAGE_NAMES[question.to]} meaning…`;
    fc.answer.className = "fc-input";
    fc.feedback.classList.add("hidden");
    fc.submit.textContent = "Check";
    fc.reveal.classList.remove("hidden");
    fc.override.classList.add("hidden");
    updateProgress();
    showPanel(fc.card);
    fc.answer.focus();
  }

  function showDone() {
    const total = queue.filter((question) => !question.retry).length;
    const repeated = queue.length > total;
    $("#fcDoneTitle").textContent = firstTry === total ? "Perfect session!" : "Session complete";
    $("#fcDoneText").textContent = `${firstTry} of ${total} correct on the first try.${repeated ? " Missed words were repeated once." : ""}`;
    fc.counter.textContent = "";
    fc.bar.style.width = "100%";
    showPanel(fc.done);
    $("#fcRestart").focus();
  }

  async function startSession({ force = false } = {}) {
    if (loading) return;
    loading = true;
    try {
      const session = await window.transwords.flashcards.session({ mode, force });
      queue = session.questions;
      index = 0;
      firstTry = 0;
      retried = new Set();
      if (!queue.length) showEmpty(session);
      else showQuestion();
    } catch (error) {
      showToast(cleanIpcError(error) || "Could not load flashcards.", { error: true });
    } finally {
      loading = false;
    }
  }

  function renderFeedback(result, reveal) {
    const titles = {
      correct: result.accentsOnly ? `Correct — mind the accents: ${result.match}` : "Correct!",
      almost: result.rootMatch ? `Almost — the full form is: ${result.match}` : `Almost — check the spelling: ${result.match}`,
      wrong: reveal ? "Here's the answer" : "Not quite"
    };
    const answers = result.answers.slice(0, 6).join(" · ") + (result.answers.length > 6 ? " …" : "");
    fc.feedback.className = `fc-feedback ${result.verdict}`;
    $("#fcFeedbackIcon").setAttribute("href", result.verdict === "wrong" ? "#i-alert" : "#i-check");
    $("#fcFeedbackTitle").textContent = titles[result.verdict];
    $("#fcFeedbackText").textContent = [result.feedback, `Accepted: ${answers}`].filter(Boolean).join(" ");
    fc.answer.className = `fc-input ${result.verdict}`;
  }

  async function check({ reveal = false } = {}) {
    const question = queue[index];
    if (!reveal && !fc.answer.value.trim()) {
      showToast("Type an answer, or choose “I don't know”", { error: true });
      fc.answer.focus();
      return;
    }
    checking = true;
    fc.submit.disabled = true;
    try {
      const result = await window.transwords.flashcards.answer({ key: question.key, answer: fc.answer.value, reveal });
      if (result.verdict !== "wrong" && !question.retry) firstTry += 1;
      // Missed cards come back once at the end of the session for reinforcement.
      if (result.verdict === "wrong" && !retried.has(question.key)) {
        retried.add(question.key);
        queue.push({ ...question, retry: true });
      }
      renderFeedback(result, reveal);
      fc.feedback.classList.remove("hidden");
      fc.answer.readOnly = true;
      fc.reveal.classList.add("hidden");
      fc.override.classList.toggle("hidden", !result.canOverride);
      fc.submit.textContent = index + 1 < queue.length ? "Next" : "Finish";
      showingFeedback = true;
      fc.submit.focus();
    } catch (error) {
      showToast(cleanIpcError(error) || "Could not check the answer.", { error: true });
    } finally {
      checking = false;
      fc.submit.disabled = false;
    }
  }

  // "I was right": the main process accepts this answer for the card from now on and re-scores it.
  async function acceptOverride() {
    const question = queue[index];
    fc.override.disabled = true;
    try {
      const { answer } = await window.transwords.flashcards.override({ key: question.key });
      if (!question.retry) firstTry += 1;
      const retryIndex = queue.findIndex((item, position) => position > index && item.key === question.key && item.retry);
      if (retryIndex !== -1) queue.splice(retryIndex, 1);
      retried.delete(question.key);
      fc.feedback.className = "fc-feedback correct";
      fc.answer.className = "fc-input correct";
      $("#fcFeedbackIcon").setAttribute("href", "#i-check");
      $("#fcFeedbackTitle").textContent = "Got it — counted as correct";
      $("#fcFeedbackText").textContent = `“${answer}” will be accepted for this card from now on.`;
      fc.override.classList.add("hidden");
      fc.submit.textContent = index + 1 < queue.length ? "Next" : "Finish";
      updateProgress();
      fc.submit.focus();
    } catch (error) {
      showToast(cleanIpcError(error) || "Could not accept the answer.", { error: true });
    } finally {
      fc.override.disabled = false;
    }
  }

  function next() {
    index += 1;
    if (index < queue.length) showQuestion();
    else showDone();
  }

  fc.form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (checking) return;
    if (showingFeedback) next();
    else check();
  });
  fc.reveal.addEventListener("click", () => { if (!checking) check({ reveal: true }); });
  fc.override.addEventListener("click", acceptOverride);
  $("#fcRestart").addEventListener("click", () => startSession());
  $("#fcPracticeAnyway").addEventListener("click", () => startSession({ force: true }));
  document.querySelectorAll("#fcModes [data-mode]").forEach((button) => button.addEventListener("click", () => {
    mode = button.dataset.mode;
    document.querySelectorAll("#fcModes [data-mode]").forEach((other) => other.classList.toggle("active", other === button));
    startSession();
  }));

  // Opening the page starts a session, unless one is already in progress.
  document.addEventListener("transwords:view", (event) => {
    if (event.detail.view !== "flashcards") return;
    const inProgress = queue.length && index < queue.length && !fc.card.classList.contains("hidden");
    if (inProgress) fc.answer.focus();
    else startSession();
  });
})();
