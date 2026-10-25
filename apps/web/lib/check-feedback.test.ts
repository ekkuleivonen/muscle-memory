import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFeedbackOf, type CheckFeedbackInput } from "./check-feedback";
import type { Diagnosis } from "./diagnosis";
import type { Verdict } from "./submission";

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  result: "passed",
  passed: 5,
  total: 5,
  rules: [],
  complete: true,
  ...over,
});
const input = (over: Partial<CheckFeedbackInput> = {}): CheckFeedbackInput => ({
  running: false,
  completed: false,
  edited: false,
  verdict: verdict(),
  diagnosis: null,
  ...over,
});

const failing: Diagnosis = {
  kind: "tests",
  rows: [
    { name: "a", visible: true, passed: true, failure: null, detail: null },
    {
      name: "ignores case",
      visible: false,
      passed: false,
      failure: { category: "wrong-value" },
      detail: null,
    },
  ],
  failed: [],
};
failing.failed.push(failing.rows[1]);

test("nothing submitted, or a submission running, is never done", () => {
  assert.equal(checkFeedbackOf(input({ verdict: null })).state, "unchecked");
  assert.equal(checkFeedbackOf(input({ running: true })).state, "running");
  assert.equal(checkFeedbackOf(input({ running: true })).tone, "busy");
});

test("completed comes only from the recorded completion", () => {
  assert.equal(checkFeedbackOf(input({ completed: true })).state, "completed");
  // A passing verdict alone is not completion: the completion record says so.
  assert.notEqual(checkFeedbackOf(input()).state, "completed");
});

test("a failing submission carries its diagnosis and counts the failed cases", () => {
  const feedback = checkFeedbackOf(
    input({ verdict: verdict({ result: "failed", passed: 1, complete: false }), diagnosis: failing }),
  );
  assert.equal(feedback.state, "failing");
  assert.equal(feedback.headline, "1 of 2 cases failed.");
  assert.equal(feedback.diagnosis, failing);
});

test("a rule holds with every case passing, and says what to change", () => {
  const feedback = checkFeedbackOf(
    input({
      verdict: verdict({
        rules: [{ id: "cents", message: "Keep money in cents.", when: { pattern: "x", present: true } }],
        complete: false,
      }),
    }),
  );
  assert.equal(feedback.state, "required");
  assert.equal(feedback.headline, "All 5 cases pass, but a rule still applies.");
  assert.deepEqual(feedback.required, [{ id: "cents", text: "Keep money in cents." }]);
});

test("editing after a submission asks for another", () => {
  assert.equal(checkFeedbackOf(input({ edited: true, verdict: verdict({ result: "failed", complete: false }) })).state, "edited");
});

test("checks that stop part-way say what is recorded, not where the code failed", () => {
  const stopped = (reason: "timeout" | "runner-error" | "cancelled") =>
    checkFeedbackOf(
      input({
        verdict: verdict({ result: reason === "cancelled" ? "cancelled" : "errored", passed: 0, complete: false }),
        diagnosis: { kind: "stopped", reason, timeoutMs: null },
      }),
    );
  assert.match(stopped("timeout").headline, /timed out/);
  assert.match(stopped("runner-error").headline, /wasn't your code/);
  assert.equal(stopped("cancelled").next, "Submit again.");
});
