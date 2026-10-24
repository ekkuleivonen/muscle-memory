import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEvidenceStore } from "./evidence-sqlite";
import { exportPending } from "./export";
import { deleteParticipant } from "./deletion";
import { referenceSubmission } from "./reference-fixture";
import { captureSubmission } from "../domain/evidence";
import { orderSource } from "../domain/source-order";

async function temporary(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "muscle-memory-source-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const A = "synthetic-participant-a";
const B = "synthetic-participant-b";
const TEXT = "[{}]";

function capture(
  participantId: string,
  observationId: string,
  sequence: number,
  sourceId = "synthetic-cli",
) {
  const input = referenceSubmission(
    TEXT,
    participantId,
    observationId,
    sequence,
  );
  return captureSubmission({ ...input, source: { id: sourceId, sequence } });
}

test("streams are per participant and source; contiguous captures have no gaps", async () =>
  temporary(async (root) => {
    const store = new SqliteEvidenceStore(join(root, "evidence.sqlite"));
    try {
      // Inserted out of order; reading is by sequence, not arrival.
      store.capture(capture(A, "a-3", 3));
      store.capture(capture(A, "a-1", 1));
      store.capture(capture(A, "a-2", 2));
      // The same positions in another source or for another participant are independent.
      store.capture(capture(A, "a-restart-1", 1, "synthetic-cli.restart-2"));
      store.capture(capture(B, "b-1", 1));
      const stream = store.sourceStream(A, "synthetic-cli");
      assert.deepEqual(
        stream.observations.map((entry) => entry.observationId),
        ["a-1", "a-2", "a-3"],
      );
      assert.equal(stream.highestSequence, 3);
      assert.deepEqual(stream.missing, {
        ranges: [],
        rangeCount: 0,
        positionCount: 0,
        truncated: false,
      });
      assert.deepEqual(stream.conflicts, []);
      assert.equal(
        store.sourceStream(A, "synthetic-cli.restart-2").observations.length,
        1,
      );
      assert.equal(store.sourceStream(B, "synthetic-cli").highestSequence, 1);
      assert.equal(
        store.sourceStream(B, "unknown-source").highestSequence,
        null,
      );
    } finally {
      store.close();
    }
  }));

test("gaps keep evidence; late arrival fills them without rewriting; export and reopen keep order", async () =>
  temporary(async (root) => {
    const database = join(root, "evidence.sqlite");
    const archive = join(root, "exports");
    let store = new SqliteEvidenceStore(database);
    store.capture(capture(A, "a-1", 1));
    store.capture(capture(A, "a-4", 4));
    assert.deepEqual(store.sourceStream(A, "synthetic-cli").missing, {
      ranges: [{ from: 2, to: 3 }],
      rangeCount: 1,
      positionCount: 2,
      truncated: false,
    });
    const before = [store.get("a-1")!.payload, store.get("a-4")!.payload];
    await exportPending(store, archive);
    store.close();

    store = new SqliteEvidenceStore(database);
    try {
      // Late arrival for an unclaimed position is accepted as a new record.
      store.capture(capture(A, "a-2", 2));
      assert.deepEqual(
        [store.get("a-1")!.payload, store.get("a-4")!.payload],
        before,
      );
      const stream = store.sourceStream(A, "synthetic-cli");
      assert.deepEqual(
        stream.observations.map((entry) => entry.sequence),
        [1, 2, 4],
      );
      assert.deepEqual(stream.missing.ranges, [{ from: 3, to: 3 }]);
      await exportPending(store, archive);
      // Exported observations alone reproduce the same order and gaps.
      const exported = [];
      for (const name of await readdir(archive)) {
        const record = JSON.parse(await readFile(join(archive, name), "utf8"));
        if (record.type === "observation.submission")
          exported.push({
            observationId: record.observationId,
            sequence: record.source.sequence,
          });
      }
      assert.deepEqual(orderSource(A, "synthetic-cli", exported), stream);
    } finally {
      store.close();
    }
  }));

test("a reused position fails without changing evidence or outbox; identical retry deduplicates", async () =>
  temporary(async (root) => {
    const store = new SqliteEvidenceStore(join(root, "evidence.sqlite"));
    try {
      const first = capture(A, "a-1", 1);
      store.capture(first);
      const pending = store.pending();
      assert.throws(
        () => store.capture(capture(A, "a-other", 1)),
        /synthetic-cli#1 is already claimed by a-1/,
      );
      assert.deepEqual(store.pending(), pending);
      assert.equal(store.get("a-other"), undefined);
      assert.equal(store.get("a-other.submission"), undefined);
      assert.equal(store.capture(first).duplicate, true);
      assert.deepEqual(store.pending(), pending);
      // Sequence validation holds at the storage boundary, not only in the constructor.
      for (const sequence of [0, 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
        const forged = capture(A, "a-forged", 2);
        assert.throws(
          () =>
            store.capture({
              ...forged,
              observation: {
                ...forged.observation,
                source: { id: "synthetic-cli", sequence },
              },
            }),
          /positive integer/,
        );
      }
      assert.deepEqual(store.pending(), pending);
    } finally {
      store.close();
    }
  }));

test("diagnostics stay bounded for huge sequences and many gaps", () => {
  const huge = orderSource(A, "s", [
    { observationId: "first", sequence: 1 },
    { observationId: "last", sequence: Number.MAX_SAFE_INTEGER },
  ]);
  assert.deepEqual(huge.missing, {
    ranges: [{ from: 2, to: Number.MAX_SAFE_INTEGER - 1 }],
    rangeCount: 1,
    positionCount: Number.MAX_SAFE_INTEGER - 2,
    truncated: false,
  });
  const sparse = orderSource(
    A,
    "s",
    Array.from({ length: 151 }, (_, index) => ({
      observationId: `o-${index}`,
      sequence: index * 2 + 1,
    })),
  );
  assert.equal(sparse.missing.ranges.length, 100);
  assert.equal(sparse.missing.rangeCount, 150);
  assert.equal(sparse.missing.positionCount, 150);
  assert.equal(sparse.missing.truncated, true);
});

test("records stored before position checks are kept and reported, not dropped", async () =>
  temporary(async (root) => {
    const database = join(root, "evidence.sqlite");
    let store = new SqliteEvidenceStore(database);
    store.capture(capture(A, "a-x", 1));
    store.capture(capture(A, "a-y", 2));
    store.capture(capture(A, "a-z", 3));
    store.close();
    // Simulate earlier local records: a shared position and a non-integer sequence.
    const raw = new DatabaseSync(database);
    raw.exec(
      "UPDATE evidence_records SET payload = json_set(payload, '$.source.sequence', 1) WHERE record_id = 'a-y'",
    );
    raw.exec(
      "UPDATE evidence_records SET payload = json_set(payload, '$.source.sequence', '3') WHERE record_id = 'a-z'",
    );
    raw.close();

    store = new SqliteEvidenceStore(database);
    try {
      const stream = store.sourceStream(A, "synthetic-cli");
      assert.deepEqual(stream.conflicts, [
        { sequence: 1, observationIds: ["a-x", "a-y"] },
      ]);
      assert.deepEqual(stream.unordered, ["a-z"]);
      assert.equal(stream.highestSequence, 1);
      assert.ok(store.evidence("a-y") && store.evidence("a-z"));
      assert.throws(
        () => store.capture(capture(A, "a-new", 1)),
        /already claimed/,
      );
    } finally {
      store.close();
    }
  }));

test("participant deletion clears that participant's streams only and survives reopen", async () =>
  temporary(async (root) => {
    const database = join(root, "evidence.sqlite");
    const archive = join(root, "exports");
    let store = new SqliteEvidenceStore(database);
    store.capture(capture(A, "a-1", 1));
    store.capture(capture(A, "a-3", 3));
    store.capture(capture(B, "b-1", 1));
    store.capture(capture(B, "b-2", 2));
    await exportPending(store, archive);
    assert.equal((await deleteParticipant(store, A, archive)).complete, true);
    store.close();

    store = new SqliteEvidenceStore(database);
    try {
      assert.equal(
        store.sourceStream(A, "synthetic-cli").highestSequence,
        null,
      );
      assert.deepEqual(
        store
          .sourceStream(B, "synthetic-cli")
          .observations.map((entry) => entry.observationId),
        ["b-1", "b-2"],
      );
      assert.throws(
        () => store.capture(capture(A, "a-2", 2)),
        /deleted locally/,
      );
      assert.equal(await exportPending(store, archive), 0);
      assert.ok(store.get("challenge.frequency-map.1.0.0"));
      assert.ok(
        !(await readdir(archive)).some((name) => name.startsWith("a-")),
      );
    } finally {
      store.close();
    }
  }));
