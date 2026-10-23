import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEventStore } from "./sqlite";
import {
  exportPending,
  removeArchivedEvent,
  syncDirectory,
  writeEvent,
} from "./export";
import { deleteParticipant } from "./deletion";
import { referenceEvent } from "./reference-fixture";

async function temporary(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "muscle-memory-deletion-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const A = "synthetic-participant-a";
const B = "synthetic-participant-b";

test("failed file removal is retried after reopen; other participant and files survive", async () =>
  temporary(async (root) => {
    const database = join(root, "events.sqlite");
    const archive = join(root, "exports");
    let store = new SqliteEventStore(database);
    store.append(referenceEvent(A, "a-exported"));
    store.append(referenceEvent(B, "b-exported"));
    assert.equal(await exportPending(store, archive), 2);
    const aPending = referenceEvent(A, "a-pending");
    store.append(aPending);
    store.append(referenceEvent(B, "b-pending"));
    // Write-before-ack leftovers: an archived but unacknowledged event and a temporary file.
    await writeEvent(
      archive,
      aPending.eventId,
      store.get("a-pending")!.payload,
    );
    const leftover = ".a-pending.00000000-0000-4000-8000-000000000000.tmp";
    await writeFile(join(archive, leftover), "partial");
    await writeFile(join(archive, "unrelated-notes.txt"), "keep");

    const result = await deleteParticipant(
      store,
      A,
      archive,
      async (directory, eventId) => {
        if (eventId === "a-exported") throw new Error("EBUSY: simulated");
        await removeArchivedEvent(directory, eventId);
      },
    );
    assert.equal(result.complete, false);
    assert.deepEqual(result.remainingFiles, ["a-exported"]);
    assert.match(result.errors[0], /simulated/);
    assert.equal(store.get("a-exported"), undefined);
    assert.equal(store.get("a-pending"), undefined);
    // Export and re-append cannot recreate the deleted participant's records.
    assert.deepEqual(
      store.pending().map((event) => event.eventId),
      ["b-pending"],
    );
    assert.throws(() => store.append(aPending), /deleted locally/);
    assert.throws(
      () => store.append(referenceEvent(B, "a-exported")),
      /awaiting archive deletion/,
    );
    store.close();

    store = new SqliteEventStore(database);
    try {
      assert.deepEqual(await deleteParticipant(store, A, archive), {
        participantId: A,
        complete: true,
        remainingFiles: [],
        errors: [],
      });
      assert.equal(await exportPending(store, archive), 1);
      assert.deepEqual((await readdir(archive)).sort(), [
        "b-exported.json",
        "b-pending.json",
        "unrelated-notes.txt",
      ]);
      assert.equal(
        await readFile(join(archive, "unrelated-notes.txt"), "utf8"),
        "keep",
      );
      assert.ok(store.get("b-exported"));
      assert.throws(() => store.append(aPending), /deleted locally/);
      // Repeating a completed deletion is a safe no-op.
      assert.equal((await deleteParticipant(store, A, archive)).complete, true);
      assert.equal(await exportPending(store, archive), 0);
      assert.equal((await readdir(archive)).length, 3);
    } finally {
      store.close();
    }
  }));

test("deletion validates identifiers and never follows archive paths", async () =>
  temporary(async (root) => {
    const archive = join(root, "exports");
    const outside = join(root, "outside.json");
    await mkdir(archive);
    await writeFile(outside, "outside");
    const store = new SqliteEventStore(join(root, "events.sqlite"));
    try {
      store.append(referenceEvent(A, "a-link"));
      store.append(referenceEvent(B, "a-link.b"));
      // A symlink at an owned name is removed itself; its target is untouched.
      await symlink(outside, join(archive, "a-link.json"));
      const similar = ".a-link.b.00000000-0000-4000-8000-000000000000.tmp";
      await writeFile(join(archive, similar), "B temporary");
      await assert.rejects(
        deleteParticipant(store, "../outside", archive),
        /opaque safe identifier/,
      );
      await assert.rejects(
        removeArchivedEvent(archive, "../outside"),
        /opaque safe identifier/,
      );
      assert.equal((await deleteParticipant(store, A, archive)).complete, true);
      assert.equal(await readFile(outside, "utf8"), "outside");
      assert.deepEqual(await readdir(archive), [similar]);
      assert.ok(store.get("a-link.b"));
      // Missing archive directory or file is idempotent success.
      assert.equal(
        (await deleteParticipant(store, B, join(root, "missing"))).complete,
        true,
      );
      assert.equal(store.get("a-link.b"), undefined);
    } finally {
      store.close();
    }
  }));

test("failed directory sync after unlink is retried before absence is recorded", async () =>
  temporary(async (root) => {
    const database = join(root, "events.sqlite");
    const archive = join(root, "exports");
    let store = new SqliteEventStore(database);
    store.append(referenceEvent(A, "a-synced"));
    assert.equal(await exportPending(store, archive), 1);
    const failed = await deleteParticipant(
      store,
      A,
      archive,
      (directory, eventId) =>
        removeArchivedEvent(directory, eventId, async () => {
          throw new Error("EIO: simulated directory sync failure");
        }),
    );
    // The unlink happened, but without a durable sync the removal stays queued.
    assert.deepEqual(failed.remainingFiles, ["a-synced"]);
    assert.deepEqual(await readdir(archive), []);
    store.close();

    store = new SqliteEventStore(database);
    try {
      const synced: string[] = [];
      const retried = await deleteParticipant(
        store,
        A,
        archive,
        (directory, eventId) =>
          removeArchivedEvent(directory, eventId, async (path) => {
            synced.push(path);
            await syncDirectory(path);
          }),
      );
      assert.equal(retried.complete, true);
      // No owned files remained, yet the existing directory was still synced.
      assert.deepEqual(synced, [archive]);
      assert.deepEqual(
        await deleteParticipant(store, A, archive, async () => {
          throw new Error("queue should be empty");
        }),
        { participantId: A, complete: true, remainingFiles: [], errors: [] },
      );
    } finally {
      store.close();
    }
  }));
