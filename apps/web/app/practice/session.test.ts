import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorState, type Transaction } from "@codemirror/state";
import { MemorySink } from "../../../../packages/capture/recorder";
import type { Runner } from "../../../../packages/runner/runner";
import { live } from "../../lib/test-fixtures";
import { PracticeSession, type SessionOptions } from "./session";

const base = live("PY-002");
const fixture = { ...base, path: base.revision.file, starter: base.revision.starter };

function session(sink: MemorySink, options: Partial<SessionOptions> = {}) {
  return new PracticeSession({
    participantId: "synthetic-participant",
    termsVersion: "2026-10-01",
    challenge: {
      key: "PY-002",
      revision: fixture.revision,
      revisionId: fixture.id,
    },
    attemptId: "attempt-1",
    sink,
    code: "",
    runner: () => ({ running: false, cancel: () => undefined }) as unknown as Runner,
    onRun: () => undefined,
    onEditedAfterRun: () => undefined,
    ...options,
  });
}

/** Builds transactions one after another, as CodeMirror applies them within one update. */
function transactions(inserts: readonly string[]): Transaction[] {
  let state = EditorState.create({ doc: "" });
  return inserts.map((insert) => {
    const transaction = state.update({
      changes: { from: state.doc.length, insert },
      userEvent: "input.type",
    });
    state = transaction.state;
    return transaction;
  });
}

function snapshots(sink: MemorySink) {
  const records = [...sink.records.values()].map((record) =>
    JSON.parse(record.payload),
  );
  const artifacts = new Map(
    records
      .filter((record) => record.artifactId)
      .map((record) => [record.artifactId, record]),
  );
  return records
    .filter((record) => record.type === "practice.snapshot")
    .map((record) => ({
      reason: record.data.reason,
      revision: record.data.revision,
      artifact: artifacts.get(record.data.codeArtifactId),
    }));
}

test("snapshots hold the exact text of the revision that triggered them, within one update batch", async () => {
  const sink = new MemorySink();
  const workspace = session(sink);
  const batch = transactions(
    Array.from({ length: 30 }, (_, index) => `${index + 1};`),
  );
  // All 30 transactions belong to one editor update: the view already shows revision 30.
  for (const transaction of batch) workspace.recordEdit(transaction);
  await workspace.recorder.flush();
  const [periodic] = snapshots(sink).filter(
    (snapshot) => snapshot.reason === "periodic",
  );
  assert.equal(periodic.revision, 25);
  assert.equal(periodic.artifact.revision, 25);
  assert.equal(periodic.artifact.files[fixture.path].text, batch[24].newDoc.toString());
  assert.notEqual(periodic.artifact.files[fixture.path].text, batch[29].newDoc.toString());
});

test("an oversize edit inside a batch is snapshotted at its own revision", async () => {
  const sink = new MemorySink();
  const workspace = session(sink);
  const batch = transactions(["a", "x".repeat(20000), "b", "c"]);
  for (const transaction of batch) workspace.recordEdit(transaction);
  await workspace.recorder.flush();
  const [oversize] = snapshots(sink).filter(
    (snapshot) => snapshot.reason === "oversize-edit",
  );
  assert.equal(oversize.revision, 2);
  assert.equal(oversize.artifact.files[fixture.path].text, batch[1].newDoc.toString());
  const edit = [...sink.records.values()]
    .map((record) => JSON.parse(record.payload))
    .find(
      (record) =>
        record.type === "practice.edit" &&
        record.data.revision === 2,
    );
  assert.equal(edit.data.changes, null);
  assert.equal(edit.data.changesTruncated, true);
});

const observations = (sink: MemorySink) =>
  [...sink.records.values()]
    .map((record) => JSON.parse(record.payload))
    .filter((record) => record.observationId)
    .sort((a, b) => a.source.sequence - b.source.sequence);

test("keys are batched with their own times; cursor bursts merge and are written before what follows", async () => {
  const sink = new MemorySink();
  const workspace = session(sink);
  const hooks = workspace.activity();
  hooks.onFocus(true);
  hooks.onKey("down", "a", "KeyA", "", false);
  hooks.onKey("up", "a", "KeyA", "", false);
  hooks.onKey("down", "Escape", "Escape", "", false);
  // A burst of cursor moves, then an edit: the moves are written first, as one observation.
  hooks.onSelection({ ranges: [{ anchor: 1, head: 1 }], main: 0 }, "select.pointer");
  hooks.onSelection({ ranges: [{ anchor: 2, head: 2 }], main: 0 }, "select.pointer");
  hooks.onSelection({ ranges: [{ anchor: 3, head: 3 }], main: 0 }, "select.pointer");
  workspace.recordEdit(transactions(["x"])[0]);
  hooks.onScroll(1, 20);
  hooks.onScroll(5, 24);
  hooks.onClipboard("copy", [{ from: 0, to: 1 }], false);
  workspace.page({ visible: false, focused: false, width: 800, height: 600 });
  await workspace.close();
  const all = observations(sink);
  const types = all.map((o) => o.type.replace("practice.", ""));
  assert.deepEqual(types, [
    "opened",
    "focus",
    "selection",
    "edit",
    "scroll",
    "clipboard",
    "page",
    "keys",
    "closed",
  ]);
  const selection = all.find((o) => o.type === "practice.selection");
  assert.equal(selection.data.moves, 3);
  assert.deepEqual(selection.data.selection.ranges, [{ anchor: 3, head: 3 }]);
  assert.deepEqual(
    all.find((o) => o.type === "practice.scroll").data,
    { file: fixture.path, fromLine: 5, toLine: 24 },
  );
  const keys = all.find((o) => o.type === "practice.keys").data.keys;
  assert.deepEqual(
    keys.map((k: unknown[]) => k.slice(1)),
    [
      ["down", "a", "KeyA", "", false],
      ["up", "a", "KeyA", "", false],
      ["down", "Escape", "Escape", "", false],
    ],
  );
  // Every observation has a monotonic time, and they never go backwards.
  const times = all.map((o) => o.elapsedMs);
  assert.ok(times.every((t, i) => typeof t === "number" && (i === 0 || t >= times[i - 1])));
  assert.ok(keys.every((k: number[]) => k[0] <= all.at(-1).elapsedMs));
});

test("closing writes what is still buffered; discarding does not", async () => {
  const kept = new MemorySink();
  const one = session(kept);
  one.activity().onKey("down", "b", "KeyB", "", false);
  await one.close();
  assert.ok(observations(kept).some((o) => o.type === "practice.keys"));
  assert.equal(observations(kept).at(-1).data.reason, "left");

  const dropped = new MemorySink();
  const two = session(dropped);
  two.activity().onKey("down", "b", "KeyB", "", false);
  await two.close(true);
  assert.ok(!observations(dropped).some((o) => o.type === "practice.keys"));
});

// A resumed attempt has no local RunView yet, but editing must mark its last submission stale.
test("restored checks are invalidated on the first edit only, without per-keystroke UI updates", async () => {
  let changes = 0;
  const workspace = session(new MemorySink(), {
    hasPreviousChecks: true,
    onEditedAfterRun: () => {
      changes++;
    },
  });
  for (const transaction of transactions(["a", "b", "c"]))
    workspace.recordEdit(transaction);
  assert.equal(changes, 1);
  await workspace.close();
});
