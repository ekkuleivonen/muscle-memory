import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFeedbackOf, type CheckFeedbackInput } from "./check-feedback";
import type { Diagnosis } from "./diagnosis";

const input = (over: Partial<CheckFeedbackInput> = {}): CheckFeedbackInput => ({
  blocker: null,
  running: false,
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
      ["not-open", "completed"],
    ] as const
  ).map(([blocker, state]) => {
    const f = checkFeedbackOf(
      input({ blocker, latest: { passed: 4, total: 5 } }),
    );
    assert.equal(f.state, state, blocker);
    return f;
  });
  // Edited, stale, pending and failing states always offer a way on and never pass.
  for (const f of states.slice(0, 6)) assert.notEqual(f.tone, "pass");
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
      required: [
        { id: "c1", author: "Priya", text: "Remove the debug print." },
      ],
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
        required: [{ id: "c", author: "A", text: "t" }],
      }),
    ),
  );
  for (const f of all)
    assert.doesNotMatch(
      `${f.headline} ${f.next ?? ""}`,
      /pull request|\bpush|merge|\bCI\b/i,
    );
});
