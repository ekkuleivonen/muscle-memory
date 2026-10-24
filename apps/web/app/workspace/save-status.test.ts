import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EditorState, type Transaction } from "@codemirror/state";
import {
  MemorySink,
  type CaptureSink,
} from "../../../../packages/capture/recorder";
import { latestSavedCode } from "../../../../packages/capture/restore";
import type { Challenge } from "../../../../packages/domain/assessment";
import { contentArtifactId } from "../../../../packages/domain/evidence";
import type { Runner } from "../../../../packages/runner/runner";
import { saveState } from "./save-state";
import { WorkspaceSession, type SaveStatus } from "./session";

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
const SAVED = /^All edits so far are saved on this device/;

function workspace(sink: CaptureSink, initialCode = "") {
  let state = EditorState.create({ doc: initialCode });
  const updates: SaveStatus[] = [];
  const session = new WorkspaceSession({
    participantId: P,
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
    onSaveStatus: (status) => updates.push(status),
  });
  (session as unknown as { view: unknown }).view = {
    get state() {
      return state;
    },
  };
  const dispatch = (transaction: Transaction) => {
    state = transaction.state;
    session.recordEdit(transaction);
  };
  return {
    session,
    updates,
    text: () => state.doc.toString(),
    type: (insert: string) =>
      dispatch(state.update({ changes: { from: state.doc.length, insert } })),
    replaceAll: (insert: string) =>
      dispatch(
        state.update({ changes: { from: 0, to: state.doc.length, insert } }),
      ),
    label: () => saveState(session.saveStatus(), true),
  };
}

const settle = async (editor: ReturnType<typeof workspace>) => {
  await editor.session.recorder.flush();
  while (editor.session.recorder.status().buffered)
    await new Promise((done) => setTimeout(done, 10));
};

test("an edit removes the saved label at once, without an update per keystroke", async () => {
  const sink = new MemorySink();
  const editor = workspace(sink);
  await settle(editor);
  assert.match(saveState(editor.updates.at(-1)!, true), SAVED);
  const before = editor.updates.length;
  editor.type("x");
  // Synchronously, before the 250 ms flush delay, the page has been told.
  assert.equal(editor.updates.length, before + 1);
  assert.doesNotMatch(saveState(editor.updates.at(-1)!, true), SAVED);
  assert.match(
    saveState(editor.updates.at(-1)!, true),
    /Saving your latest edits/,
  );
  for (const character of "yz = 1") editor.type(character);
  assert.equal(editor.updates.length, before + 1, "no update per keystroke");
  await settle(editor);
  assert.match(saveState(editor.updates.at(-1)!, true), SAVED);
  assert.equal(editor.updates.length, before + 2);
});

test("a truncated large paste is never labelled saved until a complete copy is stored", async () => {
  const sink = new MemorySink();
  const editor = workspace(sink, "def frequency_map(items):\n");
  editor.type("x".repeat(70000));
  await settle(editor);
  // The queue has drained, but the code cannot be rebuilt: no change set, truncated copy.
  assert.equal(editor.session.saveStatus().buffered, 0);
  assert.equal(editor.session.saveStatus().recoverable, false);
  assert.match(
    editor.label(),
    /cannot be fully restored after a refresh: .*64 KiB/,
  );
  assert.equal(
    latestSavedCode([...sink.records.values()], P, CHALLENGE)!.complete,
    false,
  );
  // Removing the paste is a normal edit, but replay still has no exact starting point.
  editor.replaceAll("def frequency_map(items):\n    return {}\n");
  await settle(editor);
  assert.match(editor.label(), /cannot be fully restored/);
  // Run stores a complete copy: safe again, and recovery is exact.
  await editor.session.run();
  await settle(editor);
  assert.equal(editor.session.saveStatus().recoverable, true);
  assert.match(editor.label(), SAVED);
  const recovered = latestSavedCode([...sink.records.values()], P, CHALLENGE)!;
  assert.equal(recovered.text, editor.text());
  assert.equal(recovered.complete, true);
});

test("an oversize edit within 64 KiB is recoverable through its complete snapshot", async () => {
  const sink = new MemorySink();
  const editor = workspace(sink);
  editor.type("y".repeat(20000));
  await settle(editor);
  assert.match(editor.label(), SAVED);
  assert.equal(
    latestSavedCode([...sink.records.values()], P, CHALLENGE)!.text,
    editor.text(),
  );
});

test("an artifact conflict is not labelled saved until a later complete copy is stored", async () => {
  const sink = new MemorySink();
  const editor = workspace(sink);
  editor.type("a");
  // A different payload already holds the ID of the next code revision artifact.
  const id = `${editor.session.sourceId}.code.1`;
  sink.records.set(id, {
    recordId: id,
    kind: "artifact",
    participantId: P,
    payload: "{}",
  });
  await editor.session.run();
  await settle(editor);
  assert.equal(editor.session.saveStatus().artifactConflicts, 1);
  assert.match(editor.label(), /cannot be fully restored/);
  editor.type("b");
  await editor.session.run();
  await settle(editor);
  assert.match(editor.label(), SAVED);
  assert.equal(
    latestSavedCode([...sink.records.values()], P, CHALLENGE)!.text,
    "ab",
  );
});

test("failing writes are reported, and saved returns only after they succeed", async () => {
  const sink = new MemorySink();
  let failures = 2;
  const editor = workspace({
    async write(records) {
      if (failures-- > 0) throw new Error("Simulated storage failure");
      return sink.write(records);
    },
  });
  editor.type("a");
  await editor.session.recorder.flush();
  assert.match(
    editor.label(),
    /failing and will retry: Simulated storage failure/,
  );
  await settle(editor);
  assert.match(editor.label(), SAVED);
});

test("a later snapshot that only references a conflicted artifact never clears the warning", async () => {
  const sink = new MemorySink();
  const editor = workspace(sink);
  // A different payload already holds the ID the next code revision will use.
  const id = `${editor.session.sourceId}.code.1`;
  sink.records.set(id, {
    recordId: id,
    kind: "artifact",
    participantId: P,
    payload: "{}",
  });
  // Oversize change set (not stored), with a complete snapshot that conflicts on write.
  editor.type("q".repeat(20000));
  await settle(editor);
  assert.equal(editor.session.saveStatus().artifactConflicts, 1);
  assert.equal(editor.session.saveStatus().recoverable, false);
  // Run twice at the same revision: each snapshot only references the conflicted artifact.
  for (let repeat = 0; repeat < 2; repeat++) {
    await editor.session.run();
    await settle(editor);
    assert.equal(editor.session.saveStatus().recoverable, false);
    assert.match(
      editor.label(),
      /cannot be fully restored: |conflicts with an existing record/,
    );
    assert.doesNotMatch(editor.label(), SAVED);
  }
  // The conflicting payload is kept, never overwritten.
  assert.equal(sink.records.get(id)!.payload, "{}");
  const stuck = latestSavedCode([...sink.records.values()], P, CHALLENGE)!;
  assert.notEqual(stuck.text, editor.text());
  assert.equal(stuck.complete, false);
  // A genuinely new complete copy, stored without conflict, makes the code safe again.
  editor.type("!");
  await editor.session.run();
  await settle(editor);
  assert.equal(editor.session.saveStatus().recoverable, true);
  assert.match(editor.label(), SAVED);
  const recovered = latestSavedCode([...sink.records.values()], P, CHALLENGE)!;
  assert.equal(recovered.text, editor.text());
  assert.equal(recovered.complete, true);
});
