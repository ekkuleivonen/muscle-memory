import { test } from "node:test";
import assert from "node:assert/strict";
import { ExampleGate } from "./example-gate";
import { PracticeSession } from "./session";
import { MemorySink } from "../../../../packages/capture/recorder";
import type { Revision } from "../../../../packages/content/model";
import type { RunOutcome, Runner } from "../../../../packages/runner/runner";
import { EditorState } from "@codemirror/state";
const challenge: Revision = {
  challenge: "JS-900",
  language: "javascript",
  task: "Synthetic gate fixture",
  file: "fixture.js",
  starter: "",
  entrypoint: "fixture",
  cases: [{ id: "public", input: 1, expected: 1, hidden: false }],
  rules: [],
};
const passed: RunOutcome = {
  status: "completed",
  phase: "tests",
  cases: [{ output: { text: "1", truncated: false } } as any],
  stdout: { text: "", bytes: 0, truncated: false },
  stderr: { text: "", bytes: 0, truncated: false },
  durationMs: 1,
} as RunOutcome;
test("only current-code public passes unlock; edits, undo, new context and late results cannot", () => {
  const gate = new ExampleGate(),
    runtime = {},
    otherRuntime = {};
  assert.equal(gate.allows(0, runtime), false);
  const token = gate.begin();
  gate.finish(token, 0, 0, runtime, runtime, challenge, passed);
  assert.equal(gate.allows(0, runtime), true);
  assert.equal(gate.allows(0, otherRuntime), false);
  gate.invalidate(); // Every document edit, including paste/undo, invalidates even if text returns.
  gate.finish(token, 0, 0, runtime, runtime, challenge, passed);
  assert.equal(gate.allows(0, runtime), false);
  const late = gate.begin();
  gate.finish(late, 0, 1, runtime, runtime, challenge, passed);
  assert.equal(gate.allows(1, runtime), false);
  const changedContext = gate.begin();
  gate.finish(changedContext, 1, 1, runtime, otherRuntime, challenge, passed);
  assert.equal(gate.allows(1, otherRuntime), false);
  const obsolete = gate.begin(),
    current = gate.begin();
  gate.finish(obsolete, 1, 1, runtime, runtime, challenge, passed);
  assert.equal(gate.allows(1, runtime), false);
  gate.finish(current, 1, 1, runtime, runtime, challenge, passed);
  assert.equal(gate.allows(1, runtime), true);
});
test("empty, failed, unscorable and runner-error/cancel/timeout results cannot unlock", () => {
  for (const outcome of [
    { ...passed, cases: [] },
    { ...passed, cases: [{ output: { text: "0", truncated: false } }] },
    { ...passed, cases: [{ output: { text: "1", truncated: true } }] },
    { status: "runner-error", phase: "execution", message: "synthetic" },
    { status: "cancelled" },
    { status: "timeout", timeoutMs: 5 },
    { ...passed, status: "user-error" },
  ]) {
    const gate = new ExampleGate(),
      runtime = {};
    gate.finish(
      gate.begin(),
      0,
      0,
      runtime,
      runtime,
      challenge,
      outcome as RunOutcome,
    );
    assert.equal(gate.allows(0, runtime), false);
  }
});
test("actual session submit handler enforces pass gate, including direct run submit", async () => {
  let calls = 0;
  const runner = {
    running: false,
    run: async () => {
      calls++;
      return passed;
    },
    cancel() {},
  } as unknown as Runner;
  const sink = new MemorySink();
  const session = new PracticeSession({
    participantId: "synthetic-person",
    termsVersion: "2026-10-01",
    attemptId: "synthetic-attempt",
    challenge: {
      key: "JS-900",
      revision: challenge,
      revisionId: `sha256:${"a".repeat(64)}`,
    },
    language: "javascript",
    sink,
    code: "",
    runner: () => runner,
    onRun() {},
    onEditedAfterRun() {},
  });
  // Model-independent fake view: no submitted code is executed in Node.
  (session as any).view = { destroy() {} };
  await session.submit();
  await session.run("submit");
  assert.equal(calls, 0);
  await session.run("examples");
  assert.equal(session.canSubmit, true);
  await session.submit();
  assert.equal(calls, 2);
  const state = EditorState.create({ doc: "" });
  session.recordEdit(
    state.update({
      changes: { from: 0, insert: "x" },
      userEvent: "input.paste",
    }),
  );
  assert.equal(session.canSubmit, false);
  await session.submit();
  assert.equal(calls, 2);
  await session.close();
});
