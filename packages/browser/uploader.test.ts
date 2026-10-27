import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { openPracticeStore } from "./practice-store";
import { Uploader } from "./uploader";
import { handle, type Env } from "../../apps/ingest/src/index";
import type { EventRow } from "../domain/ingest";
import { canonical, type Json } from "../domain/json";
import { SITE_CAPTURE_VERSION } from "../domain/site";

async function setup() {
  const store = await openPracticeStore(new IDBFactory());
  const participantId = await store.participantId();
  const objects = new Map<string, string>();
  const rows: EventRow[] = [];
  const env: Env = {
    CONTROL: {
      get: async (key) => (objects.has(key) ? { text: async () => objects.get(key)! } : null),
      put: async (key, value) => void objects.set(key, value),
      delete: async (key) => void objects.delete(key),
    },
    EVENTS: { send: async (sent) => void rows.push(...sent) },
  };
  let down = false;
  let clock = 0;
  const uploader = new Uploader({
    endpoint: "https://musclememory.run/ingest",
    store: async () => store,
    allowed: () => true,
    now: () => clock,
    // The real Worker, in process: the protocol is exercised end to end.
    fetch: (async (url: string, init: RequestInit) => {
      if (down) throw new TypeError("offline");
      return handle(new Request(url, init), env);
    }) as typeof fetch,
  });
  const record = (sequence: number) => {
    const value = {
      type: "site.page",
      observationId: `site-x.${sequence}`,
      participantId,
      sessionId: "session-x",
      source: { id: "site-x", sequence },
      occurredAt: "2026-10-25T10:00:00.000Z",
      elapsedMs: sequence,
      captureVersion: SITE_CAPTURE_VERSION,
      actor: "person",
      termsVersion: "2026-10-25",
      challenge: null,
      data: { visible: true },
    };
    return { recordId: value.observationId, kind: "observation" as const, participantId, payload: canonical(value as unknown as Json) };
  };
  return {
    env,
    store,
    rows,
    uploader,
    record,
    setDown: (value: boolean) => (down = value),
    advance: (ms: number) => (clock += ms),
  };
}

test("the outbox drains oldest first; failures keep records and back off; uploaded site records are forgotten", async () => {
  const t = await setup();
  await t.store.write([t.record(1), t.record(2)]);
  assert.equal(await t.store.waiting(), 2);
  // Writing the same record again is a duplicate and is not queued twice.
  await t.store.write([t.record(2)]);
  assert.equal(await t.store.waiting(), 2);
  t.setDown(true);
  await t.uploader.flush();
  assert.equal(await t.store.waiting(), 2);
  // Back online, but still inside the backoff window: nothing is tried.
  t.setDown(false);
  await t.store.write([t.record(3)]);
  await t.uploader.flush();
  assert.equal(t.rows.length, 0);
  t.advance(11_000);
  await t.uploader.flush();
  assert.equal(await t.store.waiting(), 0);
  assert.deepEqual(t.rows.map((r) => r.sequence), [1, 2, 3]);
  // Practice never needs site records again once they are uploaded.
  assert.equal((await t.store.records()).length, 0);
});

test("large backlogs go in several batches; a deleted participant stops uploading", async () => {
  const t = await setup();
  await t.store.write(Array.from({ length: 1200 }, (_, i) => t.record(i + 1)));
  await t.uploader.flush();
  assert.equal(t.rows.length, 1200);
  assert.equal(await t.store.waiting(), 0);
  const secret = await t.store.deviceSecret();
  const participantId = await t.store.participantId();
  const erased = await handle(
    new Request(`https://musclememory.run/ingest/v1/participants/${participantId}/delete`, {
      method: "POST",
      body: JSON.stringify({ secret }),
    }),
    t.env,
  );
  assert.equal(erased.status, 200);
  await t.store.write([t.record(5000)]);
  await t.uploader.flush();
  assert.equal(t.uploader.stopped, "deleted");
  assert.equal(t.rows.length, 1200);
});
