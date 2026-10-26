import { test } from "node:test";
import assert from "node:assert/strict";
import type { StoredRecord } from "../../../packages/domain/records";
import { canContinueArchived, continuationRevision } from "./continuation";
import { attemptFor, complete, parseProgress } from "./progress";

const old = `sha256:${"a".repeat(64)}`;
const next = `sha256:${"b".repeat(64)}`;
const attempt = {
  attempt: "attempt-1",
  startedAt: "t1",
  completedAt: null,
  completions: 0,
};
function record(revision: string, at: string, id = "attempt-1"): StoredRecord {
  return {
    kind: "observation",
    payload: JSON.stringify({
      challenge: "PY-002",
      attemptId: id,
      challengeRevision: revision,
      occurredAt: at,
    }),
  } as StoredRecord;
}

test("new attempts pin their revision locally and completion retains it", () => {
  const chosen = attemptFor({}, "PY-002", true, "t1", () => "attempt-1", old);
  assert.equal(chosen.progress["PY-002"].revision, old);
  const done = complete(chosen.progress, "PY-002", chosen.attempt, "t2");
  assert.equal(done["PY-002"].revision, old);
  assert.equal(
    attemptFor(done, "PY-002", true, "t3", () => "attempt-2", next).progress[
      "PY-002"
    ].revision,
    next,
  );
});

test("old attempts recover their original recorded revision, never today's revision", () => {
  assert.equal(
    continuationRevision("PY-002", attempt, [
      record(next, "t2"),
      record(old, "t1"),
      record(next, "t0", "other"),
    ]),
    old,
  );
  assert.equal(continuationRevision("PY-002", attempt, []), null);
  assert.equal(
    continuationRevision("PY-002", undefined, [record(old, "t1")]),
    null,
  );
  assert.equal(
    continuationRevision("PY-002", { ...attempt, revision: old }, []),
    old,
  );
});

test("progress accepts legacy entries and rejects malformed pins", () => {
  assert.deepEqual(
    parseProgress(JSON.stringify({ "PY-002": attempt }))["PY-002"],
    attempt,
  );
  assert.deepEqual(
    parseProgress(
      JSON.stringify({ "PY-002": { ...attempt, revision: "latest" } }),
    ),
    {},
  );
});

test("archive admits a pinned unfinished attempt and forbids every new start", () => {
  assert.equal(canContinueArchived(undefined, null), false);
  assert.equal(canContinueArchived(attempt, null), false);
  assert.equal(
    canContinueArchived({ ...attempt, completedAt: "t2" }, old),
    false,
  );
  assert.equal(canContinueArchived(attempt, old), true);
});
