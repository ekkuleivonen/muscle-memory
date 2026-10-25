import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorState, type Transaction } from "@codemirror/state";
import { history, redo, undo } from "@codemirror/commands";
import {
  MemorySink,
  type CaptureSink,
} from "../../../../packages/capture/recorder";
import { latestSavedCode } from "../../../../packages/capture/restore";
import type { StoredRecord } from "../../../../packages/domain/records";
import type { Runner } from "../../../../packages/runner/runner";
import { live } from "../../lib/test-fixtures";
import { PracticeSession } from "./session";

const base = live("PY-002");
const fixture = { ...base, path: base.revision.file, starter: base.revision.starter };
const KEY = "PY-002";
const P = "synthetic-participant";
const ATTEMPT = "attempt-1";
const challenge = {
  key: KEY,
  revision: fixture.revision,
  revisionId: fixture.id,
};

/** A workspace driven by real CodeMirror transactions, without a DOM. */
function workspace(
  sink: CaptureSink,
  initialCode = fixture.starter,
  participantId = P,
  attemptId = ATTEMPT,
) {
  let state = EditorState.create({ doc: initialCode, extensions: [history()] });
  const session = new PracticeSession({
    participantId,
    termsVersion: "2026-10-01",
    challenge,
    attemptId,
    sink,
    code: initialCode,
    runner: () =>
      ({
        running: false,
        run: async () => ({ status: "cancelled" }),
      }) as unknown as Runner,
    onRun: () => undefined,
    onEditedAfterRun: () => undefined,
  });
  // run() needs a mounted editor; the documents themselves come from the edits recorded.
  (session as unknown as { view: unknown }).view = {};
  const dispatch = (transaction: Transaction) => {
    state = transaction.state;
    if (transaction.docChanged) session.recordEdit(transaction);
  };
  return {
    session,
    text: () => state.doc.toString(),
    type(insert: string) {
      dispatch(
        state.update({
          changes: { from: state.doc.length, insert },
          userEvent: "input.type",
        }),
      );
    },
    replaceAll(insert: string) {
      dispatch(
        state.update({ changes: { from: 0, to: state.doc.length, insert } }),
      );
    },
    undo: () => undo({ state, dispatch }),
    redo: () => redo({ state, dispatch }),
  };
}

const restore = (sink: MemorySink, participantId = P) =>
  latestSavedCode([...sink.records.values()], participantId, KEY, ATTEMPT);

test("site activity about the challenge is not a newer practice session", async () => {
  const sink = new MemorySink();
  const editor = workspace(sink);
  editor.type("# saved");
  await editor.session.recorder.flush();
  const view: StoredRecord = {
    recordId: "site.1",
    kind: "observation",
    participantId: P,
    payload: JSON.stringify({
      observationId: "site.1",
      type: "site.viewed",
      challenge: KEY,
      attemptId: null,
      source: { id: "site", sequence: 1 },
      occurredAt: "2099-01-01T00:00:00.000Z",
      data: { path: "/challenges", query: "", previous: null },
    }),
  };
  const recovered = latestSavedCode(
    [...sink.records.values(), view],
    P,
    KEY,
    ATTEMPT,
  )!;
  assert.equal(recovered.complete, true);
  assert.equal(recovered.fromEarlierSession, false);
  assert.equal(recovered.files[fixture.path], editor.text());
});

test("only the given attempt's code is restored; a new attempt opens on the starter", async () => {
  const sink = new MemorySink();
  const first = workspace(sink);
  first.type("# my fix");
  await first.session.recorder.flush();
  await new Promise((done) => setTimeout(done, 5));
  const second = workspace(sink, fixture.starter, P, "attempt-2");
  second.type("# second try");
  await second.session.recorder.flush();
  const all = [...sink.records.values()];
  // Each attempt restores its own code, though the second one is newer.
  assert.equal(latestSavedCode(all, P, KEY, ATTEMPT)!.files[fixture.path], first.text());
  assert.equal(latestSavedCode(all, P, KEY, "attempt-2")!.files[fixture.path], second.text());
  // An attempt with nothing of its own yet: practice opens on the starter.
  assert.equal(latestSavedCode(all, P, KEY, "attempt-3"), null);
});

test("1 to 24 ordinary edits since opening restore exactly", async () => {
  for (let edits = 1; edits <= 24; edits++) {
    const sink = new MemorySink();
    const editor = workspace(sink);
    for (let index = 0; index < edits; index++)
      editor.type(index % 5 ? "x" : "\n    ");
    await editor.session.recorder.flush();
    const recovered = restore(sink)!;
    assert.equal(
      recovered.files[fixture.path],
      editor.text(),
      `${edits} edits`,
    );
    assert.equal(recovered.revision, edits);
    assert.equal(recovered.complete, true);
  }
});

test("edits after a run and after a periodic snapshot restore exactly", async () => {
  for (const edits of [1, 7, 24]) {
    const sink = new MemorySink();
    const editor = workspace(sink);
    editor.type("# before run");
    await editor.session.run();
    for (let index = 0; index < edits; index++) editor.type(String(index % 10));
    for (let index = 0; index < 30; index++) editor.type("y"); // crosses a periodic snapshot
    await editor.session.recorder.flush();
    const recovered = restore(sink)!;
    assert.equal(recovered.files[fixture.path], editor.text());
    assert.equal(recovered.complete, true);
  }
});

test("undo and redo restore exactly", async () => {
  const sink = new MemorySink();
  const editor = workspace(sink, "");
  editor.type("first");
  const typed = editor.text();
  assert.equal(editor.undo(), true);
  assert.equal(editor.text(), "");
  assert.equal(editor.redo(), true);
  assert.equal(editor.text(), typed);
  editor.undo();
  await editor.session.recorder.flush();
  const recovered = restore(sink)!;
  assert.equal(recovered.files[fixture.path], editor.text());
  assert.equal(recovered.files[fixture.path], "");
  assert.equal(recovered.revision, 4);
  assert.equal(recovered.complete, true);
});

test("writes that failed and were retried restore exactly", async () => {
  const sink = new MemorySink();
  let failures = 2;
  const editor = workspace({
    async write(records) {
      if (failures-- > 0) throw new Error("Simulated storage failure");
      return sink.write(records);
    },
  });
  for (const word of ["a", "b", "c"]) editor.type(word);
  await editor.session.recorder.flush();
  while (editor.session.recorder.status().buffered)
    await new Promise((done) => setTimeout(done, 20));
  assert.equal(restore(sink)!.files[fixture.path], editor.text());
});

/** Records of one session, with a chosen saved observation removed or changed. */
function edited(
  sink: MemorySink,
  change: (
    value: Record<string, unknown> & { data: Record<string, unknown> },
  ) => unknown,
): StoredRecord[] {
  return [...sink.records.values()].flatMap((record) => {
    const result = change(JSON.parse(record.payload));
    if (result === null) return [];
    return [
      result === undefined
        ? record
        : { ...record, payload: JSON.stringify(result) },
    ];
  });
}

test("a missing position stops replay at the last exact document and says so", async () => {
  const sink = new MemorySink();
  const editor = workspace(sink, "");
  for (const word of ["one", " two", " three", " four"]) editor.type(word);
  await editor.session.recorder.flush();
  const records = edited(sink, (value) =>
    value.type === "practice.edit" && value.data.revision === 3
      ? null
      : undefined,
  );
  const recovered = latestSavedCode(records, P, KEY, ATTEMPT)!;
  assert.equal(recovered.files[fixture.path], "one two");
  assert.equal(recovered.revision, 2);
  assert.equal(recovered.complete, false);
  assert.equal(recovered.latestRevision, 4);
  assert.match(recovered.reason!, /missing/);
});

test("an invalid change is not applied; a later complete snapshot is a new safe start", async () => {
  const sink = new MemorySink();
  const editor = workspace(sink, "");
  editor.type("abc");
  editor.type("def");
  await editor.session.run(); // snapshot at revision 2
  editor.type("ghi");
  await editor.session.recorder.flush();
  const corrupt = edited(sink, (value) =>
    value.type === "practice.edit" && value.data.revision === 1
      ? { ...value, data: { ...value.data, changes: [999, [0, "zzz"]] } }
      : undefined,
  );
  const recovered = latestSavedCode(corrupt, P, KEY, ATTEMPT)!;
  assert.equal(recovered.files[fixture.path], "abcdefghi");
  assert.equal(recovered.complete, true);
  // Without the snapshot, replay stops before the bad change.
  const noSnapshot = corrupt.filter(
    (record) => !JSON.parse(record.payload).data?.reason?.startsWith?.("run"),
  );
  const fallback = latestSavedCode(noSnapshot, P, KEY, ATTEMPT)!;
  assert.equal(fallback.files[fixture.path], "");
  assert.equal(fallback.complete, false);
});

test("a truncated snapshot and an oversize edit are never replayed as complete", async () => {
  const sink = new MemorySink();
  const editor = workspace(sink, "start\n");
  editor.type("x".repeat(70000)); // oversize change set, snapshot truncated at 64 KiB
  editor.type("after");
  await editor.session.recorder.flush();
  const recovered = restore(sink)!;
  assert.equal(recovered.files[fixture.path], "start\n");
  assert.equal(recovered.revision, 0);
  assert.equal(recovered.complete, false);
  assert.equal(recovered.latestRevision, 2);
  // An oversize edit with a complete snapshot is recovered through that snapshot.
  const fits = new MemorySink();
  const small = workspace(fits, "");
  small.type("y".repeat(20000));
  small.type("z");
  await small.session.recorder.flush();
  assert.equal(restore(fits)!.files[fixture.path], small.text());
  assert.equal(restore(fits)!.complete, true);
});

test("streams are never combined; participants and challenges are kept apart", async () => {
  const sink = new MemorySink();
  const older = workspace(sink, "old\n");
  older.type("older session");
  await older.session.recorder.flush();
  await new Promise((done) => setTimeout(done, 5));
  const newer = workspace(sink, "new\n");
  newer.type("newer session");
  await newer.session.recorder.flush();
  // Late edits in the older stream do not leak into the newer one.
  older.type(" late");
  await older.session.recorder.flush();
  const recovered = restore(sink)!;
  // The stream with the latest saved activity wins, replayed on its own.
  assert.equal(recovered.files[fixture.path], "old\nolder session late");
  assert.equal(recovered.sourceId, older.session.sourceId);
  assert.ok(recovered.complete);
  assert.equal(restore(sink, "someone-else"), null);
  assert.equal(
    latestSavedCode([...sink.records.values()], P, "PY-099", ATTEMPT),
    null,
  );
});

test("when the latest session has nothing recoverable, an earlier one is used and disclosed", async () => {
  const sink = new MemorySink();
  const older = workspace(sink, "");
  older.type("kept");
  await older.session.recorder.flush();
  await new Promise((done) => setTimeout(done, 5));
  const newer = workspace(sink, "fresh");
  newer.type("!");
  await newer.session.recorder.flush();
  const records = edited(sink, (value) =>
    value.type === "artifact.code-revision" &&
    String(value.artifactId).startsWith(newer.session.sourceId)
      ? null
      : undefined,
  );
  const recovered = latestSavedCode(records, P, KEY, ATTEMPT)!;
  assert.equal(recovered.files[fixture.path], "kept");
  assert.equal(recovered.fromEarlierSession, true);
  assert.equal(recovered.complete, false);
});
