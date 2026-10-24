import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EditorState, type Transaction } from "@codemirror/state";
import { history, redo, undo } from "@codemirror/commands";
import {
  MemorySink,
  type CaptureSink,
} from "../../../../packages/capture/recorder";
import { latestSavedCode } from "../../../../packages/capture/restore";
import type { Challenge } from "../../../../packages/domain/assessment";
import { contentArtifactId } from "../../../../packages/domain/evidence";
import type { WorkspaceRecord } from "../../../../packages/domain/workspace";
import type { Runner } from "../../../../packages/runner/runner";
import { WorkspaceSession } from "./session";

const challenge = JSON.parse(
  readFileSync(
    new URL(
      "../../../../content/challenges/frequency-map.v2.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as Challenge & { entrypoint: string; starter: string };
const CHALLENGE = contentArtifactId(
  "challenge",
  challenge.id,
  challenge.version,
);
const P = "synthetic-participant";

/** A workspace driven by real CodeMirror transactions, without a DOM. */
function workspace(
  sink: CaptureSink,
  initialCode = challenge.starter,
  participantId = P,
) {
  let state = EditorState.create({ doc: initialCode, extensions: [history()] });
  const session = new WorkspaceSession({
    participantId,
    consentVersion: "workspace-device-local-v1",
    challenge,
    sink,
    initialCode,
    runner: () =>
      ({
        running: false,
        run: async () => ({ status: "cancelled" }),
      }) as unknown as Runner,
    onRun: () => undefined,
    onEditedAfterRun: () => undefined,
  });
  // run() reads the document from the view; nothing else of the view is used here.
  (session as unknown as { view: unknown }).view = {
    get state() {
      return state;
    },
  };
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
  latestSavedCode([...sink.records.values()], participantId, CHALLENGE);

test("1 to 24 ordinary edits since opening restore exactly", async () => {
  for (let edits = 1; edits <= 24; edits++) {
    const sink = new MemorySink();
    const editor = workspace(sink);
    for (let index = 0; index < edits; index++)
      editor.type(index % 5 ? "x" : "\n    ");
    await editor.session.recorder.flush();
    const recovered = restore(sink)!;
    assert.equal(recovered.text, editor.text(), `${edits} edits`);
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
    assert.equal(recovered.text, editor.text());
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
  assert.equal(recovered.text, editor.text());
  assert.equal(recovered.text, "");
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
  assert.equal(restore(sink)!.text, editor.text());
});

/** Records of one session, with a chosen saved observation removed or changed. */
function edited(
  sink: MemorySink,
  change: (
    value: Record<string, unknown> & { data: Record<string, unknown> },
  ) => unknown,
): WorkspaceRecord[] {
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
    value.type === "observation.workspace.edit" && value.data.revision === 3
      ? null
      : undefined,
  );
  const recovered = latestSavedCode(records, P, CHALLENGE)!;
  assert.equal(recovered.text, "one two");
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
    value.type === "observation.workspace.edit" && value.data.revision === 1
      ? { ...value, data: { ...value.data, changes: [999, [0, "zzz"]] } }
      : undefined,
  );
  const recovered = latestSavedCode(corrupt, P, CHALLENGE)!;
  assert.equal(recovered.text, "abcdefghi");
  assert.equal(recovered.complete, true);
  // Without the snapshot, replay stops before the bad change.
  const noSnapshot = corrupt.filter(
    (record) => !JSON.parse(record.payload).data?.reason?.startsWith?.("run"),
  );
  const fallback = latestSavedCode(noSnapshot, P, CHALLENGE)!;
  assert.equal(fallback.text, "");
  assert.equal(fallback.complete, false);
});

test("a truncated snapshot and an oversize edit are never replayed as complete", async () => {
  const sink = new MemorySink();
  const editor = workspace(sink, "start\n");
  editor.type("x".repeat(70000)); // oversize change set, snapshot truncated at 64 KiB
  editor.type("after");
  await editor.session.recorder.flush();
  const recovered = restore(sink)!;
  assert.equal(recovered.text, "start\n");
  assert.equal(recovered.revision, 0);
  assert.equal(recovered.complete, false);
  assert.equal(recovered.latestRevision, 2);
  // An oversize edit with a complete snapshot is recovered through that snapshot.
  const fits = new MemorySink();
  const small = workspace(fits, "");
  small.type("y".repeat(20000));
  small.type("z");
  await small.session.recorder.flush();
  assert.equal(restore(fits)!.text, small.text());
  assert.equal(restore(fits)!.complete, true);
});

test("streams are never combined; participants and Challenges are kept apart", async () => {
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
  assert.equal(recovered.text, "old\nolder session late");
  assert.equal(recovered.sourceId, older.session.sourceId);
  assert.ok(recovered.complete);
  assert.equal(restore(sink, "someone-else"), null);
  assert.equal(
    latestSavedCode([...sink.records.values()], P, "challenge.other.1.0.0"),
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
  const recovered = latestSavedCode(records, P, CHALLENGE)!;
  assert.equal(recovered.text, "kept");
  assert.equal(recovered.fromEarlierSession, true);
  assert.equal(recovered.complete, false);
});
