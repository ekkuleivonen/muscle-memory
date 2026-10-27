/**
 * The run ledger in D1 (migrations/catalog/0002…0004): which runs exist, so nothing runs
 * twice. The model list holds the models covered; the roster, which of their reasoning levels
 * run (targets); a slot is a revision, a model, a harness version, a condition and a try.
 * `sync` makes the queue exactly what the targets still need on the live revisions; workers
 * claim slots one at a time, first tries first, so coverage grows evenly.
 */
import { canonical } from "../domain/json";
import type { Assignments } from "../domain/records";
import type { RunOutcome } from "../domain/model";

/** What the ledger needs of a database: D1 over HTTP, or SQLite locally and in tests. */
export interface Sql {
  all<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  run(sql: string, params?: readonly unknown[]): Promise<{ changes: number }>;
}

export interface Slot {
  readonly revision: string;
  readonly challengeKey: string;
  readonly model: string;
  readonly harnessVersion: string;
  readonly condition: string;
  readonly try: number;
}

export interface Claimed extends Slot {
  readonly runId: string;
}

/** A condition as stored: its arms as canonical JSON. */
export function conditionOf(assignments: Assignments = {}): string {
  return canonical(assignments as Record<string, string>);
}

/** What to cover: a model at a reasoning effort (`default` leaves it to the model). */
export interface Target {
  readonly model: string;
  readonly effort: string;
}

/** Every target on the roster. */
export function targets(db: Sql): Promise<Target[]> {
  return db.all<Target>("SELECT model, effort FROM model_roster ORDER BY model, effort");
}

/** The models on the list, in the order they were added. */
export async function roster(db: Sql): Promise<string[]> {
  const rows = await db.all<{ model: string }>("SELECT model FROM model_list ORDER BY added_at, model");
  return rows.map((r) => r.model);
}

/** Puts a model on the list, with none of its levels running yet. */
export async function addModel(db: Sql, model: string, now: string): Promise<void> {
  await db.run("INSERT OR IGNORE INTO model_list (model, added_at) VALUES (?, ?)", [model, now]);
}

/**
 * Takes a model off the list with all its targets and waiting runs. Finished runs stay, and
 * so does a run under way: it hands in as usual.
 */
export async function removeModel(db: Sql, model: string): Promise<void> {
  await db.run("DELETE FROM model_list WHERE model = ?", [model]);
  await db.run("DELETE FROM model_roster WHERE model = ?", [model]);
  await db.run("DELETE FROM model_runs WHERE model = ? AND status IN ('queued', 'harness-failed')", [model]);
}

/** Runs a reasoning level of a model (on the list, added if not). */
export async function addTarget(db: Sql, target: Target, now: string): Promise<void> {
  await addModel(db, target.model, now);
  await db.run("INSERT OR IGNORE INTO model_roster (model, effort, added_at) VALUES (?, ?, ?)", [
    target.model,
    target.effort,
    now,
  ]);
}

/**
 * Takes a target off the roster, with its waiting runs. Its finished runs stay, and so does a
 * run under way: it hands in as usual.
 */
export async function removeTarget(db: Sql, target: Target): Promise<void> {
  await db.run("DELETE FROM model_roster WHERE model = ? AND effort = ?", [target.model, target.effort]);
  await db.run(
    "DELETE FROM model_runs WHERE model = ? AND condition = ? AND status IN ('queued', 'harness-failed')",
    [target.model, targetCondition(target)],
  );
}

/** The condition a target runs under. */
export function targetCondition(target: Target): string {
  return conditionOf({ reasoning: target.effort });
}

/** Slots per insert: one JSON parameter each, well inside D1's statement limits. */
const CHUNK = 500;

/**
 * Makes the queue exactly what the roster still needs, for this harness version: every target
 * × every live revision × tries 1…tries. Missing slots are queued; slots waiting to run that
 * are no longer needed (a target removed, a revision no longer live, fewer tries) are dropped.
 * Slots that ran or are running are never touched, and nothing finished runs again. Safe to
 * call any time, any number of times.
 */
export async function sync(
  db: Sql,
  plan: {
    readonly revisions: readonly { readonly key: string; readonly revision: string }[];
    readonly targets: readonly Target[];
    readonly harnessVersion: string;
    readonly tries: number;
    readonly now: string;
  },
): Promise<{ queued: number; dropped: number }> {
  const wanted = plan.targets.flatMap((target) =>
    plan.revisions.flatMap(({ key, revision }) =>
      Array.from({ length: plan.tries }, (_, i) => ({
        r: revision,
        k: key,
        m: target.model,
        c: targetCondition(target),
        t: i + 1,
      })),
    ),
  );
  let queued = 0;
  for (let at = 0; at < wanted.length; at += CHUNK)
    queued += (
      await db.run(
        `INSERT OR IGNORE INTO model_runs
           (revision, challenge_key, model, harness_version, condition, try, status, queued_at)
         SELECT json_extract(value, '$.r'), json_extract(value, '$.k'), json_extract(value, '$.m'),
           ?, json_extract(value, '$.c'), json_extract(value, '$.t'), 'queued', ?
         FROM json_each(?)`,
        [plan.harnessVersion, plan.now, JSON.stringify(wanted.slice(at, at + CHUNK))],
      )
    ).changes;
  const { changes: dropped } = await db.run(
    `DELETE FROM model_runs
     WHERE harness_version = ? AND status IN ('queued', 'harness-failed') AND (
       try > ?
       OR revision NOT IN (SELECT value FROM json_each(?))
       OR NOT EXISTS (
         SELECT 1 FROM json_each(?)
         WHERE json_extract(value, '$.m') = model AND json_extract(value, '$.c') = condition))`,
    [
      plan.harnessVersion,
      plan.tries,
      JSON.stringify(plan.revisions.map((r) => r.revision)),
      JSON.stringify(plan.targets.map((t) => ({ m: t.model, c: targetCondition(t) }))),
    ],
  );
  return { queued, dropped };
}

/**
 * Claims the oldest queued slot (or one a harness failure left, or one still running since
 * before `staleBefore`: its worker, a closed tab, is gone) for a new run id. Two workers never
 * claim the same slot: the update only succeeds from the status and run id it read.
 */
export async function claim(
  db: Sql,
  runId: string,
  now: string,
  filter: {
    readonly harnessVersion?: string;
    readonly maxHarnessAttempts?: number;
    readonly staleBefore?: string;
  } = {},
): Promise<Claimed | null> {
  for (;;) {
    const [slot] = await db.all<{
      revision: string;
      challenge_key: string;
      model: string;
      harness_version: string;
      condition: string;
      try: number;
      status: string;
      run_id: string | null;
    }>(
      `SELECT revision, challenge_key, model, harness_version, condition, try, status, run_id
       FROM model_runs
       WHERE (status = 'queued'
           OR (status = 'harness-failed' AND harness_attempts < ?)
           OR (status = 'running' AND started_at < ? AND harness_attempts < ?))
         AND (? IS NULL OR harness_version = ?)
         -- Only what the roster still asks for, whatever is left in the queue.
         AND EXISTS (SELECT 1 FROM model_roster r
           WHERE r.model = model_runs.model AND json_extract(model_runs.condition, '$.reasoning') = r.effort)
       ORDER BY try, queued_at, revision, model, condition LIMIT 1`,
      [
        filter.maxHarnessAttempts ?? 3,
        filter.staleBefore ?? "",
        filter.maxHarnessAttempts ?? 3,
        filter.harnessVersion ?? null,
        filter.harnessVersion ?? null,
      ],
    );
    if (!slot) return null;
    const { changes } = await db.run(
      `UPDATE model_runs SET status = 'running', run_id = ?, started_at = ?,
         harness_attempts = harness_attempts + 1, harness_error = NULL
       WHERE revision = ? AND model = ? AND harness_version = ? AND condition = ? AND try = ?
         AND status = ? AND run_id IS ?`,
      [
        runId,
        now,
        slot.revision,
        slot.model,
        slot.harness_version,
        slot.condition,
        slot.try,
        slot.status,
        slot.run_id,
      ],
    );
    if (changes === 1)
      return {
        runId,
        revision: slot.revision,
        challengeKey: slot.challenge_key,
        model: slot.model,
        harnessVersion: slot.harness_version,
        condition: slot.condition,
        try: slot.try,
      };
  }
}

/** A run that played to an end: its result, kept for good. */
export async function finish(
  db: Sql,
  runId: string,
  result: {
    readonly outcome: RunOutcome;
    readonly reason: string | null;
    readonly turns: number;
    readonly submissions: number;
    /** What the run's responses reported costing, in USD; null when none reported. */
    readonly cost?: number | null;
  },
  now: string,
): Promise<void> {
  const { changes } = await db.run(
    `UPDATE model_runs SET status = 'finished', outcome = ?, reason = ?, turns = ?, submissions = ?,
       cost = ?, finished_at = ?
     WHERE run_id = ? AND status = 'running'`,
    [result.outcome, result.reason, result.turns, result.submissions, result.cost ?? null, now, runId],
  );
  if (changes !== 1) throw new Error(`run ${runId} is not running`);
}

/** The harness failed, not the model: the slot runs again later under a new run id. */
export async function harnessFailed(db: Sql, runId: string, error: string, now: string): Promise<void> {
  await db.run(
    `UPDATE model_runs SET status = 'harness-failed', harness_error = ?, finished_at = ?
     WHERE run_id = ? AND status = 'running'`,
    [error.slice(0, 2000), now, runId],
  );
}

/** The slot a run id holds, while it runs. */
export async function running(db: Sql, runId: string): Promise<Claimed | null> {
  const [row] = await db.all<{
    revision: string;
    challenge_key: string;
    model: string;
    harness_version: string;
    condition: string;
    try: number;
  }>(
    `SELECT revision, challenge_key, model, harness_version, condition, try
     FROM model_runs WHERE run_id = ? AND status = 'running'`,
    [runId],
  );
  return row
    ? {
        runId,
        revision: row.revision,
        challengeKey: row.challenge_key,
        model: row.model,
        harnessVersion: row.harness_version,
        condition: row.condition,
        try: row.try,
      }
    : null;
}

export interface Coverage {
  readonly model: string;
  readonly harness_version: string;
  readonly condition: string;
  readonly revision: string;
  readonly status: string;
  readonly outcome: string | null;
  readonly runs: number;
  /** Over the finished runs among these: their summed cost and how many reported one. */
  readonly cost: number | null;
  readonly priced: number;
  /** Over the finished runs among these: seconds from claim to hand-in, summed. */
  readonly seconds: number | null;
}

/** Slots by model, harness version, condition, revision, status and outcome. */
export function coverage(db: Sql): Promise<Coverage[]> {
  return db.all<Coverage>(
    `SELECT model, harness_version, condition, revision, status, outcome, COUNT(*) AS runs,
       SUM(cost) AS cost, COUNT(cost) AS priced,
       SUM(CASE WHEN status = 'finished'
         THEN (julianday(finished_at) - julianday(started_at)) * 86400 END) AS seconds
     FROM model_runs GROUP BY model, harness_version, condition, revision, status, outcome`,
  );
}

/** The latest started runs. */
export function recent(db: Sql, limit = 50): Promise<Record<string, unknown>[]> {
  return db.all(
    `SELECT run_id, challenge_key, model, condition, try, status, outcome, reason, turns,
       submissions, harness_attempts, harness_error, started_at, finished_at
     FROM model_runs WHERE started_at IS NOT NULL ORDER BY started_at DESC LIMIT ?`,
    [limit],
  );
}

/** Cloudflare's D1 HTTP API, for the offline harness. */
export function d1(options: {
  readonly accountId: string;
  readonly databaseId: string;
  readonly token: string;
  readonly fetch?: typeof fetch;
}): Sql {
  const url = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/d1/database/${options.databaseId}/query`;
  const query = async (sql: string, params: readonly unknown[] = []) => {
    const response = await (options.fetch ?? fetch)(url, {
      method: "POST",
      headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json" },
      body: JSON.stringify({ sql, params }),
    });
    const body = (await response.json()) as {
      success: boolean;
      errors?: { message: string }[];
      result?: { results: Record<string, unknown>[]; meta: { changes: number } }[];
    };
    if (!response.ok || !body.success || !body.result?.[0])
      throw new Error(`D1: ${body.errors?.map((e) => e.message).join("; ") || response.status}`);
    return body.result[0];
  };
  return {
    all: async <T>(sql: string, params?: readonly unknown[]) => (await query(sql, params)).results as T[],
    run: async (sql, params) => ({ changes: (await query(sql, params)).meta.changes }),
  };
}
