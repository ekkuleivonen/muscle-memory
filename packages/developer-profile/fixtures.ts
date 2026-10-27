/** Explicitly synthetic trace, with no player code, outputs or reference solutions. */
import { envelope, toRecord, type StoredRecord } from "../domain/records";
import {
  PRACTICE_CAPTURE_VERSION,
  type PracticeData,
} from "../domain/practice";
export const syntheticRevision = `sha256:${"a".repeat(64)}`;
export function trace(
  attempt = "synthetic-attempt",
  source = "synthetic-source",
  challenge = "JS-001",
  revision = syntheticRevision,
): StoredRecord[] {
  let sequence = 0;
  const out: StoredRecord[] = [];
  function add<T extends keyof PracticeData>(
    type: T,
    elapsedMs: number,
    data: PracticeData[T],
  ) {
    out.push(
      toRecord(
        envelope(
          type,
          PRACTICE_CAPTURE_VERSION,
          {
            participantId: "synthetic-participant",
            sessionId: source,
            sourceId: source,
            sequence: ++sequence,
            occurredAt: new Date(
              Date.parse("2026-10-27T10:00:00Z") + elapsedMs,
            ).toISOString(),
            elapsedMs,
            termsVersion: "2026-10-27.1",
            challenge: { key: challenge, revision },
            attemptId: attempt,
          },
          data,
        ),
      ),
    );
  }
  add("practice.started", 0, { from: "direct", query: null, position: null });
  add("practice.opened", 10, {
    revision: 0,
    codeArtifactId: "synthetic-artifact",
    entry: null,
    profile: null,
    viewport: null,
    environment: null,
    editor: { name: "CodeMirror", features: ["syntax-highlighting"] },
    runtime: { engine: "javascript", version: "synthetic" },
    captureGaps: [],
  });
  add("practice.edit", 100, {
    file: "synthetic.js",
    revision: 1,
    changes: [[0, "abc"], 2, [2]],
    changesBytes: 20,
    changesTruncated: false,
    userEvent: "input.type",
    selection: null,
    docLength: 5,
  });
  add("practice.keys", 4000, {
    file: "synthetic.js",
    keys: [
      [100, "down", "a", "KeyA", "", false],
      [180, "down", "Backspace", "Backspace", "", false],
      [3000, "down", "ArrowLeft", "ArrowLeft", "", false],
      [3100, "down", "b", "KeyB", "", false],
    ],
  });
  const run = (
    id: string,
    at: number,
    status: PracticeData["practice.run"]["status"],
  ) =>
    add("practice.run", at, {
      runId: id,
      via: "pointer",
      purpose: "submit",
      revision: 1,
      codeArtifactId: "synthetic-artifact",
      status,
      runtime: { engine: "javascript" },
      timeoutMs: 5000,
    });
  run("r1", 5000, "queued");
  run("r1", 5100, "running");
  run("r1", 6000, "result");
  add("practice.submitted", 6100, {
    runId: "r1",
    revision: 1,
    codeArtifactId: "synthetic-artifact",
    result: "failed",
    passed: 1,
    total: 3,
    rules: [],
  });
  add("practice.edit", 7000, {
    file: "synthetic.js",
    revision: 2,
    changes: [5, [0, "xy"]],
    changesBytes: 20,
    changesTruncated: false,
    userEvent: "input.paste",
    selection: null,
    docLength: 7,
  });
  run("r2", 8000, "queued");
  run("r2", 9000, "result");
  add("practice.submitted", 9100, {
    runId: "r2",
    revision: 2,
    codeArtifactId: "synthetic-artifact",
    result: "passed",
    passed: 3,
    total: 3,
    rules: [],
  });
  add("practice.completed", 9200, {
    runId: "r2",
    codeArtifactId: "synthetic-artifact",
    suggested: null,
  });
  add("practice.answered", 9300, { question: "confidence", answer: "unsure" });
  return out;
}
