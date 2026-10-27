import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  backfill,
  claim,
  conditionOf,
  finish,
  harnessFailed,
  recent,
  roster,
  running,
  setRoster,
  summary,
  type Sql,
} from "./ledger";

/** The catalog database as migrated, in memory. */
function database(): Sql {
  const db = new DatabaseSync(":memory:");
  for (const file of ["0001_catalog.sql", "0002_model_runs.sql"])
    db.exec(readFileSync(new URL(`../../migrations/catalog/${file}`, import.meta.url), "utf8"));
  return {
    all: async <T>(sql: string, params: readonly unknown[] = []) =>
      db.prepare(sql).all(...(params as never[])) as T[],
    run: async (sql, params = []) => ({
      changes: Number(db.prepare(sql).run(...(params as never[])).changes),
    }),
  };
}

const R1 = { key: "PY-001", revision: "sha256:" + "1".repeat(64) };
const R2 = { key: "GO-001", revision: "sha256:" + "2".repeat(64) };
const plan = (models: string[], revisions = [R1, R2]) => ({
  revisions,
  models,
  harnessVersion: "harness-1",
  condition: conditionOf({}),
  tries: 2,
  now: "2026-10-27T10:00:00Z",
});

test("backfill queues what is missing and nothing twice; a new model is backfilled", async () => {
  const db = database();
  await db.run("INSERT INTO model_roster (model, added_at) VALUES (?, ?), (?, ?)", [
    "a/one", "2026-10-27", "b/two", "2026-10-27",
  ]);
  await db.run("UPDATE model_roster SET retired_at = ? WHERE model = ?", ["2026-10-28", "b/two"]);
  assert.deepEqual(await roster(db), ["a/one"]);
  assert.equal(await backfill(db, plan(["a/one"])), 4);
  assert.equal(await backfill(db, plan(["a/one"])), 0);
  assert.equal(await backfill(db, plan(["a/one", "c/three"])), 4);
  // A new revision of a challenge is new slots too.
  assert.equal(await backfill(db, plan(["a/one"], [{ key: "PY-001", revision: "sha256:" + "3".repeat(64) }])), 2);
  // Another condition is a separate series.
  assert.equal(await backfill(db, { ...plan(["a/one"]), condition: conditionOf({ lookup: "offered" }) }), 4);
});

test("a slot is claimed once; a result stays; a harness failure runs again under a new id", async () => {
  const db = database();
  await backfill(db, plan(["a/one"], [R1]));
  const first = await claim(db, "run-1", "2026-10-27T10:01:00Z");
  const second = await claim(db, "run-2", "2026-10-27T10:01:00Z");
  assert.deepEqual([first?.try, second?.try], [1, 2]);
  assert.equal(await claim(db, "run-3", "2026-10-27T10:01:00Z"), null);

  await finish(db, "run-1", { outcome: "stopped", reason: "stop", turns: 4, submissions: 1 }, "2026-10-27T10:02:00Z");
  await assert.rejects(() => db.run("UPDATE model_runs SET outcome = 'completed' WHERE run_id = 'run-1'"), /a finished run is a result/);
  await assert.rejects(() =>
    finish(db, "run-1", { outcome: "completed", reason: null, turns: 1, submissions: 1 }, "2026-10-27T10:03:00Z"),
  );

  await harnessFailed(db, "run-2", "the sandbox crashed", "2026-10-27T10:02:00Z");
  const retried = await claim(db, "run-4", "2026-10-27T10:05:00Z");
  assert.equal(retried?.try, 2);
  const [row] = await db.all<{ run_id: string; harness_attempts: number; harness_error: string | null }>(
    "SELECT run_id, harness_attempts, harness_error FROM model_runs WHERE try = 2",
  );
  assert.deepEqual({ ...row }, { run_id: "run-4", harness_attempts: 2, harness_error: null });

  // After too many harness failures a slot waits for a person to look.
  await harnessFailed(db, "run-4", "again", "2026-10-27T10:06:00Z");
  await claim(db, "run-5", "2026-10-27T10:07:00Z");
  await harnessFailed(db, "run-5", "and again", "2026-10-27T10:08:00Z");
  assert.equal(await claim(db, "run-6", "2026-10-27T10:09:00Z"), null);
});

test("a run left running by a closed tab is claimed again once stale; the roster changes in place", async () => {
  const db = database();
  await setRoster(db, "a/one", false, "2026-10-27");
  await setRoster(db, "b/two", false, "2026-10-27");
  await setRoster(db, "b/two", true, "2026-10-28");
  assert.deepEqual(await roster(db), ["a/one"]);
  await setRoster(db, "b/two", false, "2026-10-29");
  assert.deepEqual(await roster(db), ["a/one", "b/two"]);

  await backfill(db, { ...plan(["a/one"], [R1]), tries: 1 });
  await claim(db, "run-1", "2026-10-27T10:00:00Z");
  assert.equal((await running(db, "run-1"))?.challengeKey, "PY-001");
  // Still fresh: nothing to claim.
  assert.equal(await claim(db, "run-2", "2026-10-27T10:30:00Z", { staleBefore: "2026-10-27T09:30:00Z" }), null);
  // Stale: claimed again, and the old run id can no longer finish.
  assert.equal((await claim(db, "run-2", "2026-10-27T13:00:00Z", { staleBefore: "2026-10-27T11:00:00Z" }))?.runId, "run-2");
  assert.equal(await running(db, "run-1"), null);
  await assert.rejects(() =>
    finish(db, "run-1", { outcome: "stopped", reason: null, turns: 1, submissions: 0 }, "2026-10-27T13:01:00Z"),
  );
  await finish(db, "run-2", { outcome: "completed", reason: null, turns: 3, submissions: 1 }, "2026-10-27T13:05:00Z");
  assert.deepEqual(
    (await summary(db)).map((s) => [s.model, s.status, s.outcome, s.runs]),
    [["a/one", "finished", "completed", 1]],
  );
  assert.equal((await recent(db))[0].run_id, "run-2");
});
