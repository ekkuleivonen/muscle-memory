import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFeedbackOf, type CheckFeedbackInput } from "./check-feedback";
import type { Diagnosis } from "./diagnosis";

const input = (over: Partial<CheckFeedbackInput> = {}): CheckFeedbackInput => ({
  blocker: null,
  running: false,
  completed: false,
  latest: { passed: 5, total: 5 },
  diagnosis: null,
  required: [],
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

test("only a clear gate reads as passed; every blocker says what is left", () => {
  assert.equal(checkFeedbackOf(input()).state, "passed");
  assert.equal(checkFeedbackOf(input()).headline, "All 5 cases pass.");
  const states = (
    [
      ["checks", "failing"],
      ["checks-pending", "running"],
      ["code-changed", "edited"],
      ["code-unconfirmed", "unconfirmed"],
      ["revision", "revision"],
      ["review", "required"],
      ["not-open", "closed"],
      ["other-merged", "closed"],
    ] as const
  ).map(([blocker, state]) => {
    const f = checkFeedbackOf(
      input({ blocker, latest: { passed: 4, total: 5 } }),
    );
    assert.equal(f.state, state, blocker);
    return f;
  });
  // Edited, stale, pending and failing states always offer a way on and never pass.
  for (const f of states) assert.notEqual(f.tone, "pass");
  for (const f of states.slice(2, 5))
    assert.equal(f.next?.includes("heck"), true);
});

test("a failing check carries its diagnosis and counts the failed cases", () => {
  const f = checkFeedbackOf(
    input({
      blocker: "checks",
      latest: { passed: 1, total: 2 },
      diagnosis: failing,
    }),
  );
  assert.equal(f.headline, "1 of 2 cases failed.");
  assert.equal(f.diagnosis, failing);
  assert.equal(f.next, "Fix the code, then check again.");
  const crashed = checkFeedbackOf(
    input({
      blocker: "checks",
      diagnosis: { kind: "stopped", reason: "runner-error", timeoutMs: null },
    }),
  );
  assert.match(crashed.headline, /wasn't your code/);
});

test("a required rule blocks with no Resolve: only changing the code clears it", () => {
  const f = checkFeedbackOf(
    input({
      blocker: "review",
      required: [{ id: "c1", text: "Nothing may be printed to stdout." }],
    }),
  );
  assert.equal(
    f.headline,
    "All 5 cases pass, but a required rule still applies.",
  );
  assert.equal(f.required.length, 1);
  assert.doesNotMatch(f.next!, /[Rr]esolve/);
});

test("nothing checked, or a check running, is never done", () => {
  assert.equal(
    checkFeedbackOf(input({ blocker: undefined, latest: null })).state,
    "unchecked",
  );
  assert.equal(checkFeedbackOf(input({ running: true })).state, "running");
});

test("no pull request vocabulary reaches the person", () => {
  const all = (
    [
      undefined,
      null,
      "checks",
      "checks-pending",
      "code-changed",
      "code-unconfirmed",
      "revision",
      "review",
      "not-open",
    ] as const
  ).map((blocker) =>
    checkFeedbackOf(
      input({
        blocker,
        diagnosis: failing,
        required: [{ id: "c", text: "t" }],
      }),
    ),
  );
  for (const f of all)
    assert.doesNotMatch(
      `${f.headline} ${f.next ?? ""}`,
      /pull request|\bpush|merge|\bCI\b/i,
    );
});

test("completed comes only from a recorded completion, never from the gate's not-open", () => {
  // A closed attempt whose last check passed 4 of 5: the gate says not-open, nothing completed it.
  const closed = checkFeedbackOf(
    input({ blocker: "not-open", latest: { passed: 4, total: 5 } }),
  );
  assert.equal(closed.state, "closed");
  assert.notEqual(closed.tone, "pass");
  assert.doesNotMatch(closed.headline, /Done/);
  // A closed attempt that failed outright reads the same.
  assert.equal(
    checkFeedbackOf(
      input({ blocker: "not-open", latest: { passed: 0, total: 5 } }),
    ).state,
    "closed",
  );
  // A genuinely completed attempt, historical (merged) or new (checks passed), is done.
  for (const blocker of ["not-open", "other-merged", null] as const) {
    const done = checkFeedbackOf(input({ blocker, completed: true }));
    assert.equal(done.state, "completed");
    assert.equal(done.tone, "pass");
  }
});

test("checks that stop part-way say what is recorded, not where the code failed", () => {
  const errored = checkFeedbackOf(
    input({
      blocker: "checks",
      latest: { passed: 0, total: 5 },
      diagnosis: {
        kind: "error",
        stage: "runtime",
        error: { type: "Error", message: "boom" },
        traceback: null,
      },
    }),
  );
  assert.equal(errored.headline, "The checks did not complete.");
  assert.doesNotMatch(errored.headline, /before any case/);
  // The recorded compile stage is said as such.
  const compile = checkFeedbackOf(
    input({
      blocker: "checks",
      latest: { passed: 0, total: 5 },
      diagnosis: {
        kind: "error",
        stage: "compile",
        error: null,
        traceback: null,
      },
    }),
  );
  assert.equal(compile.headline, "Your code didn't compile.");
});
