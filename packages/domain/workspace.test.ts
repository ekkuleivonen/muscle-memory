import { test } from "node:test";
import assert from "node:assert/strict";
import { pullRequestResult, runFeedback } from "./workspace";

// frequency_map's cases: count each exact, case-sensitive label.
const checks = [
  { expected: { a: 2, b: 1 } },
  { expected: {} },
  { expected: { A: 2, a: 1 } },
  { expected: JSON.parse('{"__proto__":2,"x":1}') },
];
const output = (value: unknown, truncated = false) => ({
  output: { text: JSON.stringify(value), truncated },
});

test("feedback scores raw outputs as canonical JSON, never Python equality", () => {
  const feedback = runFeedback(checks, [
    output({ b: 1, a: 2 }), // key order does not matter
    output({}),
    output({ A: true, a: 1 }), // Python's True == 1 would pass; JSON does not
    output(JSON.parse('{"__proto__":2,"x":1}'), true), // truncated: cannot be scored
  ]);
  assert.deepEqual(feedback.passed, [true, true, false, false]);
  assert.deepEqual(feedback.unscorable, [3]);
  assert.equal(feedback.correct, 2);
  // Missing cases (for example after a user error) are unscorable, not correct.
  assert.deepEqual(runFeedback(checks, []).unscorable, [0, 1, 2, 3]);
});

test("a pull request's checks pass only when every case passes", () => {
  const out = (text: string) => ({ output: { text, truncated: false } });
  const all = checks.map(({ expected: value }) => out(JSON.stringify(value)));
  assert.deepEqual(
    pullRequestResult(checks, {
      status: "completed",
      phase: "tests",
      cases: all,
    }),
    { result: "checks-passed", passed: all.length, total: all.length },
  );
  const oneWrong = [out("{}"), ...all.slice(1)];
  assert.deepEqual(
    pullRequestResult(checks, {
      status: "completed",
      phase: "tests",
      cases: oneWrong,
    }),
    { result: "checks-failed", passed: all.length - 1, total: all.length },
  );
  for (const outcome of [
    { status: "user-error", phase: "compile", cases: [] },
    { status: "timeout" },
    { status: "runner-error", phase: "execution" },
  ])
    assert.equal(
      pullRequestResult(checks, outcome).result,
      "checks-errored",
      outcome.status,
    );
  assert.equal(
    pullRequestResult(checks, { status: "cancelled" }).result,
    "cancelled",
  );
});
