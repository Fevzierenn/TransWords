const test = require("node:test");
const assert = require("node:assert/strict");
const { createRemoteValidator } = require("../src/services/answer-validator");

const QUESTION = { prompt: "love", from: "en", to: "tr", answers: ["aşk", "sevda"] };
const jsonResponse = (body, ok = true) => ({ ok, json: async () => body });

test("is disabled without an HTTPS endpoint", () => {
  assert.equal(createRemoteValidator({}), null);
  assert.equal(createRemoteValidator({ endpoint: "" }), null);
  assert.equal(createRemoteValidator({ endpoint: "http://validator.test" }), null);
});

test("posts the question and answer with a bearer key", async () => {
  let request;
  const validate = createRemoteValidator({
    endpoint: "https://validator.test/check",
    apiKey: "secret",
    fetchFn: async (url, options) => {
      request = { url, options };
      return jsonResponse({ correct: true, feedback: "  Close synonym.  " });
    }
  });
  const result = await validate(QUESTION, "sevgi");
  assert.deepEqual(result, { correct: true, feedback: "Close synonym." });
  assert.equal(request.url, "https://validator.test/check");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer secret");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(request.options.body), {
    prompt: "love", answer: "sevgi", from: "en", to: "tr", expected: ["aşk", "sevda"]
  });
});

test("omits the authorization header and empty feedback when not provided", async () => {
  let headers;
  const validate = createRemoteValidator({
    endpoint: "https://validator.test",
    fetchFn: async (_url, options) => {
      headers = options.headers;
      return jsonResponse({ correct: false, feedback: "   " });
    }
  });
  assert.deepEqual(await validate(QUESTION, "masa"), { correct: false });
  assert.equal(headers.Authorization, undefined);
});

test("falls back to null on failed or malformed responses", async () => {
  const withFetch = (fetchFn) => createRemoteValidator({ endpoint: "https://validator.test", fetchFn });
  assert.equal(await withFetch(async () => jsonResponse({ correct: true }, false))(QUESTION, "aşk"), null);
  assert.equal(await withFetch(async () => jsonResponse({ correct: "yes" }))(QUESTION, "aşk"), null);
  assert.equal(await withFetch(async () => { throw new Error("offline"); })(QUESTION, "aşk"), null);
});

test("gives up after the timeout", async () => {
  const validate = createRemoteValidator({
    endpoint: "https://validator.test",
    timeoutMs: 10,
    fetchFn: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    })
  });
  assert.equal(await validate(QUESTION, "aşk"), null);
});
