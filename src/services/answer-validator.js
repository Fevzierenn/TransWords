// Optional external answer validation for flashcards. This is a placeholder integration: no
// specific API is assumed. Point settings.flashcards.remoteValidation.endpoint at any HTTPS
// service that implements this contract:
//
//   POST <endpoint>
//   Content-Type: application/json
//   Authorization: Bearer <key>        (only when a key is configured)
//   { "prompt": "love", "answer": "sevgi", "from": "en", "to": "tr", "expected": ["aşk", "sevda"] }
//
//   200 OK -> { "correct": true, "feedback": "Optional short explanation" }
//
// The key is read from the environment variable named in settings (apiKeyEnv), never from files.
// Any failure returns null so callers fall back to the local verdict.
const FEEDBACK_LIMIT = 200;

function createRemoteValidator({ endpoint, apiKey, fetchFn = fetch, timeoutMs = 5000 } = {}) {
  if (!endpoint || !String(endpoint).startsWith("https://")) return null;

  return async function validate(question, answer) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const response = await fetchFn(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: question.prompt,
          answer,
          from: question.from,
          to: question.to,
          expected: question.answers
        }),
        signal: controller.signal
      });
      if (!response.ok) return null;
      const body = await response.json();
      if (typeof body?.correct !== "boolean") return null;
      const result = { correct: body.correct };
      const feedback = typeof body.feedback === "string" ? body.feedback.trim().slice(0, FEEDBACK_LIMIT) : "";
      if (feedback) result.feedback = feedback;
      return result;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { createRemoteValidator };
