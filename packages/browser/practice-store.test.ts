import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { openPracticeStore } from "./practice-store";
import type { StoredRecord } from "../domain/records";

const record = (recordId: string, payload: string): StoredRecord => ({
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
      (await store.records()).map((r) => r.payload),
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
    assert.deepEqual(await store.records(), []);
    assert.notEqual(await store.participantId(), oldId);
  } finally {
    store.close();
  }
});

test("every record written is queued for upload, oldest first, until sent", async () => {
  const store = await openPracticeStore(new IDBFactory());
  try {
    await store.write([record("s.1", "{}"), record("s.2", "{}")]);
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
    assert.deepEqual((await to.records()).map((r) => r.recordId), ["s.1", "s.2", "s.3"]);
    // What was already uploaded is not sent again; the rest is, oldest first.
    assert.deepEqual((await to.pending(10, 1_000_000)).records.map((r) => r.recordId), ["s.2", "s.3"]);
  } finally {
    to.close();
  }
});

test("private-history identity reads create no identity or retained summaries; reset preserves only ownership", async () => {
  const factory = new IDBFactory();
  const store = await openPracticeStore(factory);
  try {
    assert.equal(await store.existingIdentity(), null);
    assert.deepEqual((await store.dump()).settings, {});
    const participant = await store.participantId(),
      secret = await store.deviceSecret();
    assert.deepEqual(await store.existingIdentity(), { participant, secret });
    await store.clear(false);
    assert.deepEqual(await store.existingIdentity(), { participant, secret });
    assert.ok(
      !Object.hasOwn(
        (await store.dump()).settings,
        "developer-profile-summaries",
      ),
    );
    await store.clear(true);
    assert.equal(await store.existingIdentity(), null);
  } finally {
    store.close();
  }
});
