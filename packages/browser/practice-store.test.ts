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

test("a dump restores elsewhere as the same identity, records and upload queue", async () => {
  const from = await openPracticeStore(new IDBFactory());
  const id = await from.participantId();
  const secret = await from.deviceSecret();
  await from.write([record("s.1", "{}"), record("s.2", "{}"), record("s.3", "{}")]);
  const { keys } = await from.pending(1, 1_000_000);
  await from.sent(keys);
  const dump = await from.dump();
  from.close();
  assert.deepEqual(dump.outbox, ["s.2", "s.3"]);

  const to = await openPracticeStore(new IDBFactory());
  try {
    await to.participantId();
    await to.write([record("other.1", "{}")]);
    await to.restore(dump);
    assert.equal(await to.participantId(), id);
    assert.equal(await to.deviceSecret(), secret);
    assert.deepEqual((await to.workspaceRecords()).map((r) => r.recordId), ["s.1", "s.2", "s.3"]);
    // What was already uploaded is not sent again; the rest is, oldest first.
    assert.deepEqual((await to.pending(10, 1_000_000)).records.map((r) => r.recordId), ["s.2", "s.3"]);
  } finally {
    to.close();
  }
});
