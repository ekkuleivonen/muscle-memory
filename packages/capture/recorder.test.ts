import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  CaptureRecorder,
  MemorySink,
  type CaptureSink,
  type RecorderOptions,
  type WriteOutcome,
} from "./recorder";
import { openPracticeStore } from "../browser/practice-store";
import { orderSource } from "../domain/source-order";
import { codeRevision, type WorkspaceRecord } from "../domain/workspace";

const P = "synthetic-participant";
const S = "workspace-source-1";

function recorder(sink: CaptureSink, options: Partial<RecorderOptions> = {}) {
  return new CaptureRecorder({
    participantId: P,
    sourceId: S,
    consentVersion: "workspace-local-v1",
    challengeArtifactId: "challenge.frequency-map.2.0.0",
    sink,
    flushDelayMs: 0,
    retryBaseMs: 1,
    ...options,
  });
}

function edit(revision: number) {
  return {
    revision,
    changes: [0, [0, "x"]],
    changesBytes: 11,
    changesTruncated: false,
    userEvent: "input.type",
    selection: { ranges: [{ anchor: revision, head: revision }], main: 0 },
    docLength: revision,
  };
}

function observations(sink: MemorySink) {
  return [...sink.records.values()]
    .filter((record) => record.kind === "observation")
    .map((record) => JSON.parse(record.payload));
}

test("observations keep source order across batches and get stable IDs", async () => {
  const sink = new MemorySink();
  const batches: string[][] = [];
  const capture = recorder(
    {
      write: (records) => {
        batches.push(records.map((record) => record.recordId));
        return sink.write(records);
      },
    },
    { batchSize: 100 },
  );
  for (let revision = 1; revision <= 250; revision++)
    capture.observe("observation.workspace.edit", edit(revision));
  await capture.flush();
  assert.deepEqual(
    batches.map((batch) => batch.length),
    [100, 100, 50],
  );
  assert.deepEqual(
    batches.flat(),
    Array.from({ length: 250 }, (_, i) => `${S}.${i + 1}`),
  );
  const stored = observations(sink);
  assert.equal(stored[0].researchConsent, false);
  assert.deepEqual(stored[0].serverReceipt, {
    status: "absent",
    reason: "local-only",
  });
  const stream = orderSource(
    P,
    S,
    stored.map((record) => ({
      observationId: record.observationId,
      sequence: record.source.sequence,
    })),
  );
  assert.equal(stream.missing.rangeCount, 0);
  assert.equal(stream.highestSequence, 250);
});

test("a failed write retries the same records; partial earlier writes deduplicate", async () => {
  const sink = new MemorySink();
  let calls = 0;
  const capture = recorder({
    async write(records) {
      calls++;
      if (calls === 1) {
        // The first half reached storage before the write was interrupted.
        await sink.write(records.slice(0, 1));
        throw new Error("Simulated interrupted transaction");
      }
      if (calls === 2) throw new Error("Simulated storage busy");
      return sink.write(records);
    },
  });
  capture.observe("observation.workspace.edit", edit(1));
  capture.observe("observation.workspace.edit", edit(2));
  await capture.flush();
  assert.equal(capture.status().retrying, true);
  assert.match(capture.status().lastError!, /interrupted/);
  while (capture.status().buffered)
    await new Promise((done) => setTimeout(done, 5));
  assert.equal(calls, 3);
  assert.equal(sink.records.size, 2);
  assert.equal(capture.status().retrying, false);
  assert.equal(capture.status().persisted, 2);
});

test("a full buffer drops observations and discloses the exact gap; artifacts drop with them", async () => {
  const sink = new MemorySink();
  let release!: () => void;
  const blocked = new Promise<void>((done) => (release = done));
  const capture = recorder(
    {
      async write(records) {
        await blocked;
        return sink.write(records);
      },
    },
    { maxRecords: 6, batchSize: 100 },
  );
  const kept: (number | null)[] = [];
  for (let revision = 1; revision <= 10; revision++) {
    const artifacts =
      revision === 8 ? [codeRevision(P, S, 8, "def f(): pass")] : [];
    kept.push(
      capture.observe("observation.workspace.edit", edit(revision), artifacts)
        ?.source.sequence ?? null,
    );
  }
  await new Promise((done) => setTimeout(done, 5));
  assert.deepEqual(kept, [1, 2, 3, 4, 5, null, null, null, null, null]);
  assert.equal(capture.status().undisclosedDrops, 5);
  release();
  await capture.flush();
  await capture.flush();
  const stored = observations(sink);
  const gap = stored.find(
    (record) => record.type === "observation.workspace.capture-gap",
  );
  assert.deepEqual(gap.data, {
    fromSequence: 6,
    toSequence: 10,
    reason: "buffer-full",
  });
  assert.equal(gap.source.sequence, 11);
  assert.equal(sink.records.has(`${S}.code.8`), false);
  assert.equal(capture.status().undisclosedDrops, 0);
  const stream = orderSource(
    P,
    S,
    stored.map((record) => ({
      observationId: record.observationId,
      sequence: record.source.sequence,
    })),
  );
  assert.deepEqual(stream.missing.ranges, [{ from: 6, to: 10 }]);
});

test("a conflicting stored payload is not overwritten and becomes a disclosed gap", async () => {
  const sink = new MemorySink();
  const capture = recorder(sink);
  const first = capture.observe("observation.workspace.edit", edit(1))!;
  await capture.flush();
  // A second recorder reusing the same source (a bug) conflicts at position 1.
  const reused = recorder(sink);
  reused.observe("observation.workspace.edit", edit(99));
  await reused.flush();
  await reused.flush();
  assert.equal(
    JSON.parse(sink.records.get(first.observationId)!.payload).data.revision,
    1,
  );
  const gap = observations(sink).find(
    (record) => record.type === "observation.workspace.capture-gap",
  );
  assert.deepEqual(gap.data, {
    fromSequence: 1,
    toSequence: 1,
    reason: "write-conflict",
  });
});

test("stop waits for the in-flight write, then discards the buffer and writes nothing more", async () => {
  const sink = new MemorySink();
  let release!: () => void;
  const blocked = new Promise<void>((done) => (release = done));
  let writes = 0;
  const capture = recorder(
    {
      async write(records) {
        writes++;
        await blocked;
        return sink.write(records);
      },
    },
    { batchSize: 1 },
  );
  capture.observe("observation.workspace.edit", edit(1));
  capture.observe("observation.workspace.edit", edit(2));
  await new Promise((done) => setTimeout(done, 5));
  const stopping = capture.stop();
  release();
  await stopping;
  sink.clear();
  await new Promise((done) => setTimeout(done, 20));
  assert.equal(writes, 1);
  assert.equal(sink.records.size, 0);
  assert.equal(capture.observe("observation.workspace.edit", edit(3)), null);
  assert.equal(capture.status().buffered, 0);
});

function record(recordId: string, payload: string): WorkspaceRecord {
  return { recordId, kind: "observation", participantId: P, payload };
}

test("IndexedDB batches commit atomically, deduplicate, reject conflicts and clear with identity", async () => {
  const factory = new IDBFactory();
  let store = await openPracticeStore(factory);
  const id = await store.participantId();
  assert.deepEqual(await store.write([record("a", "1"), record("b", "2")]), [
    "written",
    "written",
  ]);
  // An invalid record aborts the transaction: nothing from that batch is stored.
  // The first error is reported, not a follow-on error from the records after it.
  await assert.rejects(
    store.write([
      record("c", "3"),
      { ...record("d", "4"), recordId: undefined as never },
      record("e", "5"),
    ]),
    (error: Error) => error.name === "DataError",
  );
  store.close();
  store = await openPracticeStore(factory);
  try {
    assert.deepEqual(
      (await store.workspaceRecords()).map((row) => row.recordId),
      ["a", "b"],
    );
    assert.deepEqual(
      await store.write([record("a", "1"), record("b", "changed")]),
      ["duplicate", "conflict"],
    );
    assert.equal(
      (await store.workspaceRecords()).find((row) => row.recordId === "b")!
        .payload,
      "2",
    );
    assert.equal(await store.participantId(), id);
    await store.clear();
    assert.deepEqual(await store.workspaceRecords(), []);
    assert.notEqual(await store.participantId(), id);
  } finally {
    store.close();
  }
});

test("upgrading the version 1 database keeps saved attempts", async () => {
  const factory = new IDBFactory();
  await new Promise<void>((resolve) => {
    const request = factory.open("muscle-memory-local-practice", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("events", { keyPath: "eventId" });
      request.result.createObjectStore("settings");
      request
        .transaction!.objectStore("events")
        .add({ eventId: "legacy-1", payload: "{}" });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
  const store = await openPracticeStore(factory);
  try {
    assert.equal((await store.pending()).length, 1);
    assert.deepEqual(await store.workspaceRecords(), []);
  } finally {
    store.close();
  }
});
