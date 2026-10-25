import { test } from "node:test";
import assert from "node:assert/strict";
import { attemptFor, complete, completed, parseProgress } from "./progress";

const challenge = { id: "frequency-map", key: "PY-002" };
let n = 0;
const newId = () => `attempt-${++n}`;

test("the first open starts an attempt; opening again resumes it", () => {
  const first = attemptFor({}, challenge, false, "t1", newId);
  assert.equal(first.fresh, true);
  const again = attemptFor(first.progress, challenge, true, "t2", newId);
  assert.deepEqual([again.fresh, again.attempt], [false, first.attempt]);
});

test("after completing, a start begins a new attempt; a plain open resumes the completed one", () => {
  const { progress, attempt } = attemptFor({}, challenge, true, "t1", newId);
  const done = complete(progress, challenge.id, attempt, "t2");
  assert.equal(completed(done, "PY-002"), true);
  assert.equal(attemptFor(done, challenge, false, "t3", newId).attempt, attempt);
  const next = attemptFor(done, challenge, true, "t3", newId);
  assert.equal(next.fresh, true);
  assert.notEqual(next.attempt, attempt);
  // Completed once still counts while the new attempt is under way.
  assert.equal(completed(next.progress, "PY-002"), true);
  assert.equal(next.progress[challenge.id].completions, 1);
});

test("completing is once per attempt, and only the current attempt completes", () => {
  const { progress, attempt } = attemptFor({}, challenge, true, "t1", newId);
  const once = complete(progress, challenge.id, attempt, "t2");
  assert.equal(complete(once, challenge.id, attempt, "t3"), once);
  assert.equal(complete(progress, challenge.id, "someone-else", "t2"), progress);
});

test("malformed storage reads as no progress", () => {
  assert.deepEqual(parseProgress(null), {});
  assert.deepEqual(parseProgress("not json"), {});
  assert.deepEqual(parseProgress('{"x": {"key": "FN-1"}}'), {});
});
