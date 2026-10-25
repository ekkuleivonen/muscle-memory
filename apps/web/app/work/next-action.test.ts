import assert from "node:assert/strict";
import test from "node:test";
import { nextAction } from "./next-action";

const editing = {
  done: false,
  running: false,
  unavailable: false,
  openPull: false,
  blocker: undefined,
  stale: false,
  localPassed: false,
};

test("arrival, failed run and edited green lead to testing; current green leads to push", () => {
  assert.equal(nextAction(editing), "test");
  assert.equal(nextAction({ ...editing, localPassed: true }), "push");
  assert.equal(
    nextAction({ ...editing, localPassed: true, stale: true }),
    "test",
  );
});

test("only current eligible or review-blocked PRs promote review", () => {
  for (const blocker of [null, "review"] as const) {
    assert.equal(nextAction({ ...editing, openPull: true, blocker }), "review");
    assert.equal(
      nextAction({ ...editing, openPull: true, blocker, stale: true }),
      "test",
    );
  }
  for (const blocker of [
    undefined,
    "checks",
    "checks-pending",
    "revision",
    "code-changed",
    "code-unconfirmed",
    "not-open",
    "other-merged",
  ] as const) {
    assert.equal(nextAction({ ...editing, openPull: true, blocker }), "test");
  }
  assert.equal(nextAction({ ...editing, blocker: null }), "test");
});

test("cancellation, environment recovery and completion have their own priority", () => {
  assert.equal(
    nextAction({ ...editing, running: true, localPassed: true }),
    "cancel",
  );
  assert.equal(
    nextAction({ ...editing, unavailable: true, localPassed: true }),
    "retry",
  );
  assert.equal(
    nextAction({ ...editing, done: true, openPull: true, blocker: null }),
    "continue",
  );
});
