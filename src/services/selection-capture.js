const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function captureSelectedText({ clipboard, keyboard, Key, timeoutMs = 1200, waitFn = wait }) {
  const marker = `__TRANSWORDS_SELECTION_${Date.now()}_${Math.random()}__`;
  clipboard.writeText(marker);

  // Let the physical Ctrl+T keys rise before emitting a separate Ctrl+C chord.
  await waitFn(100);
  await keyboard.type(Key.LeftControl, Key.C);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await waitFn(40);
    const selected = clipboard.readText().trim();
    if (selected && selected !== marker) return selected;
  }

  clipboard.clear();
  throw new Error("No selected text was found. Select text and press Ctrl+T again.");
}

module.exports = { captureSelectedText };
