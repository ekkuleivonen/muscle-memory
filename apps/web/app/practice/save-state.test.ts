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
  assert.match(recoveryMessage(saved), /no newer code was found/);
  assert.doesNotMatch(recoveryMessage(saved), /last few changes/);
  assert.match(
    recoveryMessage({ ...saved, latestRevision: 5 }),
    /your last few changes weren't/,
  );
});

test("fallback to an older session does not compare unrelated revision counters", () => {
  const message = recoveryMessage({ ...saved, fromEarlierSession: true });
  assert.match(message, /the most recent one couldn't be recovered/);
  assert.doesNotMatch(message, /no newer code/);
});
