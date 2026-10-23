import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEventStore } from "./sqlite";
import { exportPending, writeEvent } from "./export";
import { referenceEvent } from "./reference-fixture";
import { snapshot } from "../domain/assessment";
import { createAttemptEvent } from "../domain/events";

async function temporary(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "muscle-memory-events-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("immutable event and pending export survive restart; identical retries deduplicate", async () =>
  temporary(async (root) => {
    const event = referenceEvent();
    let store = new SqliteEventStore(join(root, "events.sqlite"));
    assert.deepEqual(store.append(event), {
      eventId: event.eventId,
      duplicate: false,
    });
    store.close();
    store = new SqliteEventStore(join(root, "events.sqlite"));
    try {
      assert.deepEqual(store.append(event), {
        eventId: event.eventId,
        duplicate: true,
      });
      assert.equal(store.pending().length, 1);
      assert.throws(
        () => store.append({ ...event, occurredAt: "2026-01-02T00:00:00Z" }),
        /different content/,
      );
      const stored = JSON.parse(store.get(event.eventId)!.payload);
      assert.equal(stored.assessment.assessmentVersion, "1.0.0");
      assert.deepEqual(stored.attempt.encounter, event.attempt.encounter);
      assert.deepEqual(stored.challengeSnapshot, event.challengeSnapshot);
      assert.deepEqual(stored.adventureSnapshot, event.adventureSnapshot);
      assert.equal(stored.researchConsent, false);
      const forged = {
        ...event,
        eventId: "forged-1",
        attempt: { ...event.attempt, id: "forged-1" },
        assessment: {
          ...event.assessment,
          attemptId: "forged-1",
          correctness: 0,
        },
      };
      assert.throws(() => store.append(forged), /assessment does not match/);
      assert.equal(store.get("forged-1"), undefined);
      assert.equal(store.pending().length, 1);
    } finally {
      store.close();
    }
  }));

test("write-before-ack failure retries without duplicate archive or lost events", async () =>
  temporary(async (root) => {
    const event = referenceEvent();
    const database = join(root, "events.sqlite");
    const archive = join(root, "exports");
    let store = new SqliteEventStore(database);
    store.append(event);
    await assert.rejects(
      exportPending(store, archive, async (...args) => {
        await writeEvent(...args);
        throw new Error("Simulated crash after write before acknowledgment");
      }),
      /Simulated crash/,
    );
    assert.equal(store.pending().length, 1);
    store.close();
    store = new SqliteEventStore(database);
    try {
      assert.equal(await exportPending(store, archive), 1);
      assert.equal(await exportPending(store, archive), 0);
      assert.equal(store.pending().length, 0);
      assert.equal(
        JSON.parse(
          await readFile(join(archive, `${event.eventId}.json`), "utf8"),
        ).eventId,
        event.eventId,
      );
    } finally {
      store.close();
    }
  }));

test("conflicting archive is preserved and event stays pending", async () =>
  temporary(async (root) => {
    const event = referenceEvent();
    const store = new SqliteEventStore(join(root, "events.sqlite"));
    try {
      store.append(event);
      await writeEvent(root, event.eventId, "different payload");
      await assert.rejects(exportPending(store, root), /Export conflict/);
      assert.equal(store.pending().length, 1);
      assert.equal(
        await readFile(join(root, `${event.eventId}.json`), "utf8"),
        "different payload\n",
      );
      assert.throws(
        () => store.acknowledge(event.eventId, "wrong payload"),
        /missing or changed/,
      );
    } finally {
      store.close();
    }
  }));

test("event creation pins context, copies content and rejects unknown formula", () => {
  const event = referenceEvent();
  const adventure = { ...event.adventureSnapshot };
  const copy = createAttemptEvent(
    adventure,
    event.challengeSnapshot,
    event.attempt,
  );
  adventure.story = "Changed later";
  assert.notEqual(copy.adventureSnapshot.story, adventure.story);
  assert.throws(
    () =>
      createAttemptEvent(
        { ...adventure, presentation: "other" },
        event.challengeSnapshot,
        event.attempt,
      ),
    /Encounter/,
  );
  const changed = { ...event.challengeSnapshot, assessment_version: "2.0.0" };
  // Snapshot matches new content, but no implementation exists for the new formula.
  assert.throws(
    () =>
      createAttemptEvent(event.adventureSnapshot, changed, {
        ...event.attempt,
        challengeSnapshot: snapshot(changed),
      }),
    /Unsupported assessment/,
  );
});
