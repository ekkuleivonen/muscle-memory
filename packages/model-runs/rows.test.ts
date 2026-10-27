import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blobArtifact, blobRecord, modelObservation } from "../domain/model";
import { envelope, toRecord } from "../domain/records";
import { PRACTICE_CAPTURE_VERSION } from "../domain/practice";
import { rowOf, runNdjson } from "./rows";

const input = {
  participantId: "model:test_model",
  sessionId: "run-1",
  sourceId: "model-1",
  sequence: 1,
  occurredAt: "2026-10-27T10:00:00.000Z",
  elapsedMs: 4.5,
  challenge: { key: "PY-001", revision: "sha256:" + "a".repeat(64) },
  attemptId: "attempt-1",
};
const ended = toRecord(modelObservation("model.ended", input, { outcome: "stopped", reason: null, turns: 1, submissions: 0 }));
const blob = blobRecord(blobArtifact(input.participantId, "application/json", "{}", "f".repeat(64)));

test("a run's rows have exactly the events table's columns", () => {
  const schema = JSON.parse(
    readFileSync(new URL("../../apps/ingest/events.schema.json", import.meta.url), "utf8"),
  ) as { fields: { name: string }[] };
  const row = rowOf(ended, "2026-10-27T10:01:00.000Z");
  assert.deepEqual(Object.keys(row), schema.fields.map((f) => f.name));
  assert.deepEqual(
    [row.type, row.session_id, row.source_id, row.sequence, row.elapsed_ms, row.terms_version, row.country],
    ["model.ended", "run-1", "model-1", 1, 4.5, null, null],
  );
  assert.equal(row.payload, ended.payload);
  const artifact = rowOf(blob, "2026-10-27T10:01:00.000Z");
  assert.deepEqual([artifact.kind, artifact.type, artifact.sequence], ["artifact", "artifact.blob", null]);
});

test("a run's NDJSON is one row per record, and never a person's record", () => {
  const lines = runNdjson([ended, blob], "2026-10-27T10:01:00.000Z").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.record_id), [ended.recordId, blob.recordId]);
  const person = toRecord(
    envelope("practice.closed", PRACTICE_CAPTURE_VERSION, { ...input, termsVersion: "2026-10-26" }, { reason: "left" as const }),
  );
  assert.throws(() => runNdjson([person], "2026-10-27T10:01:00.000Z"), /not a model's/);
});
