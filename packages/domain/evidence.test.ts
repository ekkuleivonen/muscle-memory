import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boundText,
  captureSubmission,
  CAPTURE_LIMIT_BYTES,
  verifyCapture,
} from "./evidence";
import { projectAssessment } from "./projection";
import { referenceSubmission } from "../storage/reference-fixture";

function evidenceOf(text: string) {
  const captured = captureSubmission(referenceSubmission(text));
  return {
    captured,
    evidence: {
      observation: captured.observation,
      submission: captured.submission,
      adventure: captured.artifacts[0],
      challenge: captured.artifacts[1],
    },
  };
}

test("capture keeps original text and context without parsing or scoring", () => {
  const text =
    '  [ {"a":2, "b":1},\n{}, {"A":2,"a":1}, {"__proto__":2,"x":1} ]\t\n';
  const { captured, evidence } = evidenceOf(text);
  assert.equal(captured.submission.text, text);
  assert.equal(captured.submission.capture.truncated, false);
  assert.equal(captured.observation.researchConsent, false);
  assert.deepEqual(captured.observation.serverReceipt, {
    status: "absent",
    reason: "local-only",
  });
  assert.deepEqual(captured.observation.source, {
    id: "synthetic-cli",
    sequence: 1,
  });
  assert.ok(captured.observation.captureGaps.includes("workspace-edits"));
  const projection = projectAssessment(evidence);
  assert.equal(projection.outcome.status, "assessed");
  assert.deepEqual(projection.observationIds, ["synthetic-submission-1"]);
  assert.deepEqual(projection.artifactIds, [
    "adventure.field-notes.1.0.0",
    "challenge.frequency-map.1.0.0",
    "synthetic-submission-1.submission",
  ]);
  // Evidence is unchanged by projecting it.
  assert.equal(evidence.submission.text, text);
});

test("oversize input is bounded deterministically at a character boundary", () => {
  const text = "é".repeat(CAPTURE_LIMIT_BYTES); // 2 bytes each, twice the limit
  const first = evidenceOf(text).captured;
  const second = evidenceOf(text).captured;
  assert.deepEqual(first, second);
  assert.deepEqual(first.submission.capture, {
    captureVersion: "synthetic-submission-capture-1.0.0",
    limitBytes: CAPTURE_LIMIT_BYTES,
    originalBytes: CAPTURE_LIMIT_BYTES * 2,
    capturedBytes: CAPTURE_LIMIT_BYTES,
    truncated: true,
  });
  assert.ok(first.observation.captureGaps.includes("submission-truncated"));
  // An odd limit cannot split a 2-byte character.
  assert.deepEqual(boundText("éé", 3), {
    text: "é",
    originalBytes: 4,
    capturedBytes: 2,
    truncated: true,
  });
  assert.equal(
    projectAssessment(evidenceOf(text).evidence).outcome.status,
    "not-assessed-truncated",
  );
  // A record claiming completeness for a prefix is rejected.
  assert.throws(
    () =>
      verifyCapture({
        ...first,
        submission: {
          ...first.submission,
          capture: { ...first.submission.capture, truncated: false },
        },
      }),
    /inconsistent/,
  );
});

test("malformed JSON is captured and becomes a parse-failure projection", () => {
  const { captured, evidence } = evidenceOf('[{"a": 2,');
  assert.equal(captured.submission.text, '[{"a": 2,');
  assert.deepEqual(projectAssessment(evidence).outcome, {
    status: "parse-failed",
    message: "Enter a valid JSON array.",
  });
});
