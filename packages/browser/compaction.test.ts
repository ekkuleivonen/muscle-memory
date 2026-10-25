import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { compactable } from "./compaction";
import { openPracticeStore } from "./practice-store";
import type { StoredRecord } from "../domain/records";

let n = 0;
const observation = (
  type: string,
  source: string,
  extra: { challenge?: string; attemptId?: string } = {},
): StoredRecord => {
  const sequence = ++n;
  return {
    recordId: `${source}.${sequence}`,
    kind: "observation",
    participantId: "p",
    payload: JSON.stringify({
      type,
      source: { id: source, sequence },
      occurredAt: `2026-10-26T10:00:${String(sequence).padStart(2, "0")}.000Z`,
      challenge: extra.challenge ?? null,
      attemptId: extra.attemptId ?? null,
    }),
  };
};
const artifact = (source: string, revision: number): StoredRecord => ({
  recordId: `${source}.code.${revision}`,
  kind: "artifact",
  participantId: "p",
  payload: "{}",
});

const first = { challenge: "PY-002", attemptId: "attempt-1" };
const second = { challenge: "PY-002", attemptId: "attempt-2" };
const other = { challenge: "JS-003", attemptId: "attempt-3" };
const records = [
  observation("site.viewed", "site-a"),
  observation("practice.started", "practice-a", first),
  artifact("practice-a", 0),
  observation("practice.completed", "practice-a", first),
  observation("practice.started", "practice-b", second),
  artifact("practice-b", 0),
  observation("practice.edit", "practice-b", second),
  observation("practice.opened", "practice-c", other),
  artifact("practice-c", 0),
];
const ids = (list: readonly StoredRecord[]) => list.map((r) => r.recordId);

test("uploaded site records and earlier attempts go; each challenge's latest attempt stays", () => {
  const gone = compactable(records, new Set());
  assert.deepEqual(gone, [
    records[0].recordId,
    records[1].recordId,
    "practice-a.code.0",
    records[3].recordId,
  ]);
  const kept = ids(records).filter((id) => !gone.includes(id));
  assert.deepEqual(kept, [
    records[4].recordId,
    "practice-b.code.0",
    records[6].recordId,
    records[7].recordId,
    "practice-c.code.0",
  ]);
});

test("nothing still queued for upload is forgotten", () => {
  const queued = new Set([records[0].recordId, records[1].recordId, "practice-a.code.0"]);
  assert.deepEqual(compactable(records, queued), [records[3].recordId]);
});

test("the store compacts in place and keeps the upload queue", async () => {
  const store = await openPracticeStore(new IDBFactory());
  await store.write(records);
  const queued = await store.pending(100, 1e9);
  assert.equal(await store.compact(), 0, "nothing uploaded, nothing forgotten");
  await store.sent(queued.keys);
  assert.equal(await store.compact(), 4);
  assert.deepEqual(
    ids(await store.records()).sort(),
    [records[4], records[6], records[7]].map((r) => r.recordId).concat("practice-b.code.0", "practice-c.code.0").sort(),
  );
  store.close();
});
