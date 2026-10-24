import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { openPracticeStore } from "./practice-store";
import type { WorkspaceRecord } from "../domain/workspace";

const record = (recordId: string, payload: string): WorkspaceRecord => ({
  recordId,
  kind: "observation",
  participantId: "p",
  payload,
});

test("records and the pseudonymous identity survive reopen; retries deduplicate", async () => {
  const factory = new IDBFactory();
  let store = await openPracticeStore(factory);
  const id = await store.participantId();
  assert.deepEqual(await store.write([record("s.1", "{}")]), ["written"]);
  store.close();
  store = await openPracticeStore(factory);
  try {
    assert.equal(await store.participantId(), id);
    assert.deepEqual(
      await store.write([record("s.1", "{}"), record("s.1", '{"x":1}')]),
      ["duplicate", "conflict"],
    );
    assert.deepEqual(
      (await store.workspaceRecords()).map((r) => r.payload),
      ["{}"],
    );
  } finally {
    store.close();
  }
});

test("clear removes records and the identity together", async () => {
  const factory = new IDBFactory();
  let store = await openPracticeStore(factory);
  const oldId = await store.participantId();
  await store.write([record("s.1", "{}")]);
  await store.clear();
  store.close();
  store = await openPracticeStore(factory);
  try {
    assert.deepEqual(await store.workspaceRecords(), []);
    assert.notEqual(await store.participantId(), oldId);
  } finally {
    store.close();
  }
});
