import { test } from "node:test";
import assert from "node:assert/strict";
import type { RecoveredCode } from "../../../../packages/capture/restore";
import { recoveryMessage } from "./save-state";

const saved: RecoveredCode = {
  files: { "main.py": "pass" },
  revision: 4,
  latestRevision: 4,
  sourceId: "workspace-test",
  complete: false,
  fromEarlierSession: false,
  reason: "saved activity is missing",
};

test("missing activity without a newer code revision does not claim lost edits", () => {
  assert.match(recoveryMessage(saved), /No newer code revision was found/);
  assert.doesNotMatch(recoveryMessage(saved), /Later saved changes/);
  assert.match(
    recoveryMessage({ ...saved, latestRevision: 5 }),
    /Later saved changes \(up to revision 5\) were not recovered/,
  );
});

test("fallback to an older session does not compare unrelated revision counters", () => {
  const message = recoveryMessage({ ...saved, fromEarlierSession: true });
  assert.match(message, /The latest session could not be recovered/);
  assert.doesNotMatch(message, /No newer code revision/);
});
