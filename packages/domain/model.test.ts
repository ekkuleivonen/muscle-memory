import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRecord } from "./ingest";
import { blobArtifact, blobRecord, modelObservation, modelParticipant, MODEL_CAPTURE_VERSION } from "./model";
import { envelope, toRecord } from "./records";
import { PRACTICE_CAPTURE_VERSION } from "./practice";

const input = {
  participantId: modelParticipant("anthropic/claude-opus-5-5"),
  sessionId: "run-1",
  sourceId: "model-run-1",
  sequence: 1,
  occurredAt: "2026-10-27T10:00:00.000Z",
  elapsedMs: 0,
  challenge: { key: "PY-001", revision: "sha256:" + "a".repeat(64) },
  attemptId: "attempt-run-1",
};

test("a model's observations say so and carry no Terms version", () => {
  const ended = modelObservation("model.ended", input, {
    outcome: "stopped",
    reason: null,
    turns: 3,
    submissions: 1,
  });
  assert.equal(ended.actor, "model");
  assert.equal(ended.termsVersion, null);
  assert.equal(ended.captureVersion, MODEL_CAPTURE_VERSION);
  assert.equal(ended.participantId, "model:anthropic_claude-opus-5-5");
});

test("a person needs the Terms they accepted; a model may not have any", () => {
  const data = { reason: "left" as const };
  assert.throws(() =>
    envelope("practice.closed", PRACTICE_CAPTURE_VERSION, { ...input, termsVersion: null }, data),
  );
  assert.throws(() =>
    envelope(
      "practice.closed",
      PRACTICE_CAPTURE_VERSION,
      { ...input, actor: "model", termsVersion: "2026-10-26" },
      data,
    ),
  );
  const person = envelope(
    "practice.closed",
    PRACTICE_CAPTURE_VERSION,
    { ...input, termsVersion: "2026-10-26" },
    data,
  );
  assert.equal(person.actor, "person");
});

test("ingest refuses a model's practice observations and its blobs", () => {
  const participant = input.participantId;
  const practice = envelope(
    "practice.closed",
    PRACTICE_CAPTURE_VERSION,
    { ...input, actor: "model", termsVersion: null },
    { reason: "run-ended" as const },
  );
  const refused = checkRecord(toRecord(practice), participant, "2026-10-27T10:00:01.000Z");
  assert.deepEqual(refused, { ok: false, recordId: practice.observationId, reason: "not a person" });
  const blob = blobArtifact(participant, "application/json", "{}", "b".repeat(64));
  assert.equal(blob.artifactId, `blob.sha256-${"b".repeat(64)}`);
  assert.equal(checkRecord(blobRecord(blob), participant, "2026-10-27T10:00:01.000Z").ok, false);
});

test("model names become participant ids", () => {
  assert.equal(modelParticipant("openai/gpt-6:free"), "model:openai_gpt-6:free");
  assert.equal(modelParticipant("~anthropic/claude-sonnet-latest"), "model:_anthropic_claude-sonnet-latest");
});
