import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { codeRevision, runFeedback, toRecord } from "./workspace";
import { CAPTURE_LIMIT_BYTES } from "./evidence";
import type { Challenge } from "./assessment";
import { latestSavedCode } from "../capture/restore";

const challenge = JSON.parse(
  readFileSync(
    new URL("../../content/challenges/frequency-map.v2.json", import.meta.url),
    "utf8",
  ),
) as Challenge;
const output = (value: unknown, truncated = false) => ({
  output: { text: JSON.stringify(value), truncated },
});

test("feedback scores raw outputs as canonical JSON, never Python equality", () => {
  const feedback = runFeedback(challenge, [
    output({ b: 1, a: 2 }), // key order does not matter
    output({}),
    output({ A: true, a: 1 }), // Python's True == 1 would pass; JSON does not
    output(JSON.parse('{"__proto__":2,"x":1}'), true), // truncated: cannot be scored
  ]);
  assert.deepEqual(feedback.passed, [true, true, false, false]);
  assert.deepEqual(feedback.unscorable, [3]);
  assert.equal(feedback.correct, 2);
  // Missing cases (for example after a user error) are unscorable, not correct.
  assert.deepEqual(runFeedback(challenge, []).unscorable, [0, 1, 2, 3]);
});

test("restore picks the latest complete snapshot and skips truncated ones", () => {
  const P = "synthetic-participant";
  const snapshot = (sequence: number, revision: number, at: string) =>
    toRecord({
      schemaVersion: "1.0.0",
      type: "observation.workspace.snapshot",
      observationId: `source-1.${sequence}`,
      participantId: P,
      source: { id: "source-1", sequence },
      occurredAt: at,
      serverReceipt: { status: "absent", reason: "local-only" },
      captureVersion: "workspace-capture-1.0.0",
      consentVersion: "workspace-device-local-v1",
      researchConsent: false,
      challengeArtifactId: "challenge.frequency-map.2.0.0",
      data: {
        revision,
        codeArtifactId: `source-1.code.${revision}`,
        reason: "run",
      },
    });
  const records = [
    toRecord(codeRevision(P, "source-1", 1, "def first(): pass\n")),
    snapshot(1, 1, "2026-10-24T10:00:00Z"),
    toRecord(
      codeRevision(P, "source-1", 2, "x".repeat(CAPTURE_LIMIT_BYTES + 1)),
    ),
    snapshot(2, 2, "2026-10-24T10:05:00Z"),
    // Another participant's newer snapshot is never offered.
    toRecord(codeRevision("someone-else", "source-1", 3, "other\n")),
  ];
  assert.deepEqual(latestSavedCode(records, P), {
    text: "def first(): pass\n",
    revision: 1,
  });
  assert.equal(latestSavedCode(records, "nobody"), null);
});
