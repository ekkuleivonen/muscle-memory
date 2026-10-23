import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { openPracticeStore, encodePendingExport } from "./practice-store";
import { referenceEvent } from "../storage/reference-fixture";
import { createAttemptEvent } from "../domain/events";

test("committed events and pseudonymous identity survive reopen; retries deduplicate", async () => {
  const factory = new IDBFactory();
  let store = await openPracticeStore(factory);
  const id = await store.participantId();
  const fixture = referenceEvent();
  const event = createAttemptEvent(
    fixture.adventureSnapshot,
    fixture.challengeSnapshot,
    { ...fixture.attempt, participantId: id },
  );
  assert.equal((await store.append(event)).duplicate, false);
  store.close();
  store = await openPracticeStore(factory);
  try {
    assert.equal(await store.participantId(), id);
    assert.equal((await store.append(event)).duplicate, true);
    assert.deepEqual(await store.pending(), [event]);
    const changed = createAttemptEvent(
      fixture.adventureSnapshot,
      fixture.challengeSnapshot,
      { ...event.attempt, assistance: "assisted" },
    );
    await assert.rejects(store.append(changed), /different content/);
    assert.deepEqual(await store.pending(), [event]);
  } finally {
    store.close();
  }
});

test("download remains retryable; clear removes records, pending export and identity", async () => {
  const factory = new IDBFactory();
  let store = await openPracticeStore(factory);
  const oldId = await store.participantId();
  await store.append(referenceEvent());
  const first = encodePendingExport(await store.pending());
  assert.equal(JSON.parse(first.trim()).schemaVersion, "1.0.0");
  assert.equal(encodePendingExport(await store.pending()), first);
  await store.clear();
  store.close();
  store = await openPracticeStore(factory);
  try {
    assert.deepEqual(await store.pending(), []);
    assert.equal(encodePendingExport(await store.pending()), "");
    assert.notEqual(await store.participantId(), oldId);
  } finally {
    store.close();
  }
});
