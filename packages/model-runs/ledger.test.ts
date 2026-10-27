import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  addModel,
  addTarget,
  claim,
  coverage,
  finish,
  harnessFailed,
  recent,
  removeModel,
  removeTarget,
  roster,
  running,
  sync,
  targets,
  type Sql,
  type Target,
} from "./ledger";
import { estimate, summarize } from "./coverage";

/** The catalog database as migrated, in memory. */
function database(): Sql {
  const db = new DatabaseSync(":memory:");
  for (const file of ["0001_catalog.sql", "0002_model_runs.sql", "0003_model_run_targets.sql", "0004_model_list_and_costs.sql"])
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
const OPUS: Target = { model: "a/one", effort: "default" };
const OPUS_MAX: Target = { model: "a/one", effort: "max" };
const NOW = "2026-10-27T10:00:00Z";

async function syncAll(db: Sql, revisions = [R1, R2], tries = 2, harnessVersion = "harness-1") {
  return sync(db, { revisions, targets: await targets(db), harnessVersion, tries, now: NOW });
}

async function play(db: Sql, runId: string, outcome: "completed" | "stopped" = "completed") {
  const slot = await claim(db, runId, NOW);
  assert.ok(slot, "a slot to play");
  await finish(db, runId, { outcome, reason: null, turns: 2, submissions: 1 }, NOW);
  return slot;
}

test("sync queues exactly what the roster still needs, and is safe to repeat", async () => {
  const db = database();
  await addTarget(db, OPUS, NOW);
  await addTarget(db, OPUS, NOW);
  assert.deepEqual((await targets(db)).map((t) => ({ ...t })), [OPUS]);
  assert.deepEqual(await syncAll(db), { queued: 4, dropped: 0 });
  assert.deepEqual(await syncAll(db), { queued: 0, dropped: 0 });

  // A second effort for the same model is a series of its own.
  await addTarget(db, OPUS_MAX, NOW);
  assert.deepEqual(await roster(db), ["a/one"]);
  assert.deepEqual(await syncAll(db), { queued: 4, dropped: 0 });

  // Finished runs are never queued again, whatever sync is asked.
  await play(db, "run-1");
  await play(db, "run-2");
  assert.deepEqual(await syncAll(db), { queued: 0, dropped: 0 });

  // A removed target's waiting runs go with it; its finished ones stay, and sync has nothing to drop.
  await removeTarget(db, OPUS);
  const dropped = await syncAll(db);
  const left = await db.all<{ condition: string; status: string }>("SELECT condition, status FROM model_runs");
  assert.ok(left.every((r) => r.condition === '{"reasoning":"max"}' || r.status === "finished"));
  assert.deepEqual(dropped, { queued: 0, dropped: 0 });

  // A revision no longer live: its waiting runs go too. Fewer tries: the extra ones go.
  await syncAll(db, [R1], 1);
  const waiting = await db.all<{ revision: string; try: number }>(
    "SELECT revision, try FROM model_runs WHERE status = 'queued'",
  );
  assert.ok(waiting.every((r) => r.revision === R1.revision && r.try === 1));

  // A new harness version is new work; the old version's results stay as they were.
  assert.equal((await syncAll(db, [R1, R2], 2, "harness-2")).queued, 4);
});

test("only targets on the roster run; removing one drops its waiting runs at once", async () => {
  const db = database();
  await addTarget(db, OPUS, NOW);
  await addTarget(db, OPUS_MAX, NOW);
  await syncAll(db, [R1], 1);
  // Queued before a roster change and never synced since: still not claimed.
  await db.run("DELETE FROM model_roster WHERE effort = 'max'");
  const claimed = await claim(db, "run-1", NOW);
  assert.equal(claimed?.condition, '{"reasoning":"default"}');
  assert.equal(await claim(db, "run-2", NOW), null);
  // Removing a target takes its waiting runs with it; finished and running ones stay.
  await addTarget(db, OPUS_MAX, NOW);
  await removeTarget(db, OPUS);
  await removeTarget(db, OPUS_MAX);
  const left = await db.all<{ condition: string; status: string }>("SELECT condition, status FROM model_runs");
  assert.deepEqual(left.map((r) => [r.condition, r.status]), [['{"reasoning":"default"}', "running"]]);
});

test("first tries come first, so coverage grows evenly", async () => {
  const db = database();
  await addTarget(db, OPUS, NOW);
  await addTarget(db, OPUS_MAX, NOW);
  await syncAll(db, [R1, R2], 3);
  const order: number[] = [];
  for (let i = 0; i < 4; i++) order.push((await play(db, `run-${i}`)).try);
  assert.deepEqual(order, [1, 1, 1, 1]);
});

test("coverage counts live revisions with every try finished, and what is left to do", async () => {
  const db = database();
  await addTarget(db, OPUS, NOW);
  await addTarget(db, OPUS_MAX, NOW);
  await syncAll(db, [R1, R2], 2);
  // a/one default: both tries of R1 finished, R2 untouched.
  await db.run(
    `UPDATE model_runs SET status = 'finished', outcome = 'completed', run_id = 'x' || try, started_at = ?, finished_at = ?
     WHERE model = 'a/one' AND condition = '{"reasoning":"default"}' AND revision = ?`,
    [NOW, NOW, R1.revision],
  );
  const live = [R1.revision, R2.revision];
  const [defaultEffort, maxEffort] = summarize(await coverage(db), await targets(db), live, "harness-1", 2);
  assert.deepEqual(
    [defaultEffort.effort, defaultEffort.covered, defaultEffort.started, defaultEffort.finished, defaultEffort.waiting, defaultEffort.todo],
    ["default", 1, 1, 2, 2, 2],
  );
  assert.deepEqual([maxEffort.effort, maxEffort.covered, maxEffort.todo], ["max", 0, 4]);
  // A new revision of R1: its old runs no longer count.
  const moved = summarize(await coverage(db), await targets(db), ["sha256:" + "3".repeat(64), R2.revision], "harness-1", 2);
  assert.deepEqual([moved[0].covered, moved[0].todo], [0, 4]);
  // A target removed from the roster still shows its results, with nothing to do.
  await removeTarget(db, OPUS);
  const after = summarize(await coverage(db), await targets(db), live, "harness-1", 2);
  assert.deepEqual(
    after.map((t) => [t.effort, t.onRoster, t.finished, t.todo]),
    [["default", false, 2, 0], ["max", true, 0, 4]],
  );
});

test("a slot is claimed once; a result stays; a harness failure runs again under a new id", async () => {
  const db = database();
  await addTarget(db, OPUS, NOW);
  await syncAll(db, [R1], 2);
  const first = await claim(db, "run-1", NOW);
  const second = await claim(db, "run-2", NOW);
  assert.deepEqual([first?.try, second?.try], [1, 2]);
  assert.equal(await claim(db, "run-3", NOW), null);

  await finish(db, "run-1", { outcome: "stopped", reason: "stop", turns: 4, submissions: 1 }, NOW);
  await assert.rejects(() => db.run("UPDATE model_runs SET outcome = 'completed' WHERE run_id = 'run-1'"), /a finished run is a result/);
  await assert.rejects(() => finish(db, "run-1", { outcome: "completed", reason: null, turns: 1, submissions: 1 }, NOW));

  await harnessFailed(db, "run-2", "the sandbox crashed", NOW);
  const retried = await claim(db, "run-4", NOW);
  assert.equal(retried?.try, 2);
  const [row] = await db.all<{ run_id: string; harness_attempts: number; harness_error: string | null }>(
    "SELECT run_id, harness_attempts, harness_error FROM model_runs WHERE try = 2",
  );
  assert.deepEqual({ ...row }, { run_id: "run-4", harness_attempts: 2, harness_error: null });

  // After too many harness failures a slot waits for a person to look.
  await harnessFailed(db, "run-4", "again", NOW);
  await claim(db, "run-5", NOW);
  await harnessFailed(db, "run-5", "and again", NOW);
  assert.equal(await claim(db, "run-6", NOW), null);
});

test("a run left running by a closed tab is claimed again once stale", async () => {
  const db = database();
  await addTarget(db, OPUS, NOW);
  await syncAll(db, [R1], 1);
  await claim(db, "run-1", "2026-10-27T10:00:00Z");
  assert.equal((await running(db, "run-1"))?.challengeKey, "PY-001");
  assert.equal(await claim(db, "run-2", "2026-10-27T10:30:00Z", { staleBefore: "2026-10-27T09:30:00Z" }), null);
  assert.equal((await claim(db, "run-2", "2026-10-27T13:00:00Z", { staleBefore: "2026-10-27T11:00:00Z" }))?.runId, "run-2");
  assert.equal(await running(db, "run-1"), null);
  await assert.rejects(() =>
    finish(db, "run-1", { outcome: "stopped", reason: null, turns: 1, submissions: 0 }, "2026-10-27T13:01:00Z"),
  );
  await finish(db, "run-2", { outcome: "completed", reason: null, turns: 3, submissions: 1 }, "2026-10-27T13:05:00Z");
  assert.equal((await recent(db))[0].run_id, "run-2");
});

test("the model list holds models whatever levels run; taking one off drops its waiting runs", async () => {
  const db = database();
  await addModel(db, "b/two", NOW);
  await addTarget(db, OPUS, NOW);
  assert.deepEqual(await roster(db), ["a/one", "b/two"]);
  await syncAll(db, [R1], 1);
  await play(db, "run-1");
  await addTarget(db, OPUS_MAX, NOW);
  await syncAll(db, [R1], 1);
  await removeModel(db, "a/one");
  assert.deepEqual(await roster(db), ["b/two"]);
  assert.deepEqual(await targets(db), []);
  const left = await db.all<{ status: string }>("SELECT status FROM model_runs WHERE model = 'a/one'");
  assert.deepEqual(left.map((r) => r.status), ["finished"]);
});

test("cost and time to finish come from the level's runs, else the model's", async () => {
  const db = database();
  await addTarget(db, OPUS, NOW);
  await addTarget(db, OPUS_MAX, NOW);
  await syncAll(db, [R1, R2], 1);
  // One default run: $0.02 over 30 seconds.
  const slot = await claim(db, "run-1", "2026-10-27T10:00:00Z");
  assert.equal(slot?.condition, '{"reasoning":"default"}');
  await finish(db, "run-1", { outcome: "completed", reason: null, turns: 2, submissions: 1, cost: 0.02 }, "2026-10-27T10:00:30Z");
  const rows = summarize(await coverage(db), await targets(db), [R1.revision, R2.revision], "harness-1", 1);
  const [own, other] = rows;
  assert.deepEqual([own.effort, own.spent, own.costPerRun, own.estimatedFrom, own.todo], ["default", 0.02, 0.02, "level", 1]);
  assert.ok(Math.abs(own.secondsPerRun! - 30) < 0.01);
  // max hasn't run: estimated from the model's default runs.
  assert.deepEqual([other.effort, other.costPerRun, other.estimatedFrom, other.todo], ["max", 0.02, "model", 2]);
  const left = estimate(rows);
  assert.ok(Math.abs(left.cost - 0.06) < 1e-9);
  assert.ok(Math.abs(left.seconds - 90) < 0.01);
  assert.equal(left.unknown, 0);
  // A model that has never run can't be estimated yet.
  await addTarget(db, { model: "c/new", effort: "high" }, NOW);
  await syncAll(db, [R1, R2], 1);
  const fresh = summarize(await coverage(db), await targets(db), [R1.revision, R2.revision], "harness-1", 1);
  assert.equal(estimate(fresh.filter((r) => r.model === "c/new")).unknown, 2);
});
