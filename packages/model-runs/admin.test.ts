import { test } from "node:test";
import assert from "node:assert/strict";
import { modelObservation, modelParticipant } from "../domain/model";
import { envelope, toRecord } from "../domain/records";
import { PRACTICE_CAPTURE_VERSION } from "../domain/practice";
import { checkRunRecords, conditionFrom, MODEL_ID, requestFor, runCost } from "./admin";

const slot = {
  runId: "5a3d2b1c-0000-4000-8000-000000000001",
  revision: "sha256:" + "a".repeat(64),
  challengeKey: "PY-001",
  model: "anthropic/claude-opus-5.5",
  harnessVersion: "harness-1",
  condition: '{"reasoning":"default"}',
  try: 1,
};
const input = (sequence: number) => ({
  participantId: modelParticipant(slot.model),
  sessionId: `run-${slot.runId}`,
  sourceId: `model-${slot.runId}`,
  sequence,
  occurredAt: "2026-10-27T10:00:00.000Z",
  elapsedMs: sequence,
  challenge: { key: slot.challengeKey, revision: slot.revision },
  attemptId: `attempt-${slot.runId}`,
});
const ended = (sequence: number) =>
  toRecord(modelObservation("model.ended", input(sequence), { outcome: "completed", reason: null, turns: 2, submissions: 1 }));

test("a finished run's records must all be this run's", () => {
  assert.equal(checkRunRecords([ended(1), ended(2)], slot).length, 2);
  assert.throws(() => checkRunRecords([], slot));
  assert.throws(() => checkRunRecords([ended(1), ended(1)], slot), /repeated/);
  assert.throws(() => checkRunRecords([ended(1)], { ...slot, runId: "another" }), /not this run's/);
  assert.throws(() => checkRunRecords([ended(1)], { ...slot, revision: "sha256:" + "b".repeat(64) }), /not this run's/);
  assert.throws(() => checkRunRecords([ended(1)], { ...slot, model: "openai/gpt-6.1-terra" }), /another participant/);
  // A person's observation never passes, even dressed up as this run's.
  const person = toRecord(
    envelope("practice.closed", PRACTICE_CAPTURE_VERSION, { ...input(3), termsVersion: "2026-10-26" }, { reason: "left" as const }),
  );
  assert.throws(() => checkRunRecords([ended(1), person], slot), /not this run's/);
});

test("conditions are a reasoning effort; requests follow the condition and the listing", () => {
  assert.deepEqual(conditionFrom({ reasoning: "high" }), { reasoning: "high" });
  assert.throws(() => conditionFrom({ reasoning: "turbo" }));
  assert.deepEqual(requestFor({ reasoning: "default" }, ["tools"]), {});
  assert.deepEqual(requestFor({ reasoning: "max" }, ["tools", "logprobs"]), {
    reasoning: { effort: "max" },
    logprobs: true,
    top_logprobs: 20,
    provider: { require_parameters: true },
  });
  for (const id of ["anthropic/claude-opus-5.5", "deepseek/deepseek-v4.1-flash-1017", "a/b:free", "~google/gemini-latest"])
    assert.ok(MODEL_ID.test(id), id);
  for (const id of ["opus", "a/b c", "../x", "a/b/c"]) assert.ok(!MODEL_ID.test(id), id);
});

test("a run's cost is what its responses reported", () => {
  const response = (sequence: number, cost: unknown) =>
    toRecord(
      modelObservation("model.response", input(sequence), {
        turn: sequence,
        attempt: 1,
        generationId: null,
        model: null,
        provider: null,
        message: {},
        finishReason: "stop",
        nativeFinishReason: null,
        usage: cost === undefined ? null : { cost } as never,
        error: null,
        timing: { sentMs: 0, headersMs: null, firstLineMs: null, firstReasoningMs: null, firstContentMs: null, firstToolCallMs: null, lastLineMs: null },
      }),
    );
  assert.equal(runCost([response(1, 0.01), response(2, 0.02), ended(3)]), 0.03);
  assert.equal(runCost([response(1, undefined), ended(2)]), null);
  assert.equal(runCost([response(1, "lots")]), null);
});
