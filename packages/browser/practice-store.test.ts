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

test("upgrading to the outbox queues records made before it, so nothing is skipped", async () => {
  const factory = new IDBFactory();
  // A version 3 store, as it was before uploads existed.
  await new Promise<void>((resolve, reject) => {
    const request = factory.open("muscle-memory-local-practice", 3);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("settings");
      const workspace = request.result.createObjectStore("workspace", { keyPath: "recordId" });
      workspace.add(record("s.1", "{}"));
      workspace.add(record("s.2", "{}"));
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
  const store = await openPracticeStore(factory);
  try {
    assert.equal(await store.waiting(), 2);
    const { keys, records } = await store.pending(10, 1_000_000);
    assert.deepEqual(records.map((r) => r.recordId), ["s.1", "s.2"]);
    await store.sent(keys);
    assert.equal(await store.waiting(), 0);
    assert.ok((await store.deviceSecret()).length >= 32);
    assert.equal(await store.deviceSecret(), await store.deviceSecret());
  } finally {
    store.close();
  }
});
