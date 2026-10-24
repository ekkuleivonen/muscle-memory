import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EditorState, type Transaction } from "@codemirror/state";
import { MemorySink } from "../../../../packages/capture/recorder";
import type { Challenge } from "../../../../packages/domain/assessment";
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

function session(sink: MemorySink) {
  return new WorkspaceSession({
    participantId: "synthetic-participant",
    consentVersion: "workspace-session-v1",
    challenge,
    sink,
    initialCode: "",
    runner: () => ({ running: false }) as unknown as Runner,
    onRun: () => undefined,
    onEditedAfterRun: () => undefined,
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
    .filter((record) => record.type === "observation.workspace.snapshot")
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
  assert.equal(periodic.artifact.text, batch[24].newDoc.toString());
  assert.notEqual(periodic.artifact.text, batch[29].newDoc.toString());
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
  assert.equal(oversize.artifact.text, batch[1].newDoc.toString());
  const edit = [...sink.records.values()]
    .map((record) => JSON.parse(record.payload))
    .find(
      (record) =>
        record.type === "observation.workspace.edit" &&
        record.data.revision === 2,
    );
  assert.equal(edit.data.changes, null);
  assert.equal(edit.data.changesTruncated, true);
});
