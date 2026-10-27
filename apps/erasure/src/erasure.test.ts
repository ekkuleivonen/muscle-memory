import { test } from "node:test";
import assert from "node:assert/strict";
import { run, tombstones, type Bucket } from "./erasure";

function bucket(keys: string[], pageSize = 2) {
  const objects = new Map<string, string>(keys.map((key) => [key, "{}"]));
  const control: Bucket = {
    list: async ({ prefix, cursor }) => {
      const matching = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = matching.slice(start, start + pageSize);
      const truncated = start + pageSize < matching.length;
      return { objects: page.map((key) => ({ key })), truncated, cursor: truncated ? String(start + pageSize) : undefined };
    },
    put: async (key, value) => void objects.set(key, value),
  };
  return { control, objects };
}

test("every tombstone is found, across pages", async () => {
  const { control } = bucket(["deleted/p-c", "deleted/p-a", "participants/p-x", "deleted/p-b", "erased/p-a/1.json"]);
  assert.deepEqual(await tombstones(control), ["p-a", "p-b", "p-c"]);
});

test("a run erases every tombstoned participant and records only erasures that removed rows", async () => {
  const { control, objects } = bucket(["deleted/p-gone", "deleted/p-also-gone", "deleted/p-never-uploaded"]);
  let asked: string[] = [];
  const now = new Date("2026-10-25T12:00:00.123Z");
  const result = await run(control, async (ids) => {
    asked = ids;
    return { "p-gone": 5, "p-also-gone": 2 };
  }, now);
  assert.deepEqual(asked, ["p-also-gone", "p-gone", "p-never-uploaded"]);
  assert.deepEqual(result, { requests: 3, rows: 7, participants: 2 });
  assert.deepEqual(JSON.parse(objects.get("erased/p-gone/20261025T120000Z.json")!), {
    erasedAt: "2026-10-25T12:00:00.123Z",
    rows: 5,
  });
  assert.ok(!objects.has("erased/p-never-uploaded/20261025T120000Z.json"));
});

test("no tombstones: the job is not started; a failed erasure records nothing", async () => {
  const empty = bucket([]);
  let started = false;
  assert.deepEqual(await run(empty.control, async () => ((started = true), {}), new Date()), {
    requests: 0,
    rows: 0,
    participants: 0,
  });
  assert.equal(started, false);
  const { control, objects } = bucket(["deleted/p-gone"]);
  await assert.rejects(run(control, async () => Promise.reject(new Error("catalog down")), new Date()));
  assert.deepEqual([...objects.keys()], ["deleted/p-gone"]);
});
