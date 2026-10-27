/**
 * The run ledger in D1 (migrations/catalog/0002_model_runs.sql): which runs exist, so nothing
 * runs twice and anything missing can be backfilled. A slot is a revision, a model, a harness
 * version, a condition and a try. Backfilling is queueing every slot the roster and the
 * published revisions call for; the slots already there are left alone.
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

/** The models on the roster now. */
export async function roster(db: Sql): Promise<string[]> {
  const rows = await db.all<{ model: string }>(
    "SELECT model FROM model_roster WHERE retired_at IS NULL ORDER BY model",
  );
  return rows.map((r) => r.model);
}

/**
 * Queues every slot for these revisions, the roster, this harness version and condition, and
 * tries 1…tries. Returns how many were new.
 */
export async function backfill(
  db: Sql,
  plan: {
    readonly revisions: readonly { readonly key: string; readonly revision: string }[];
    readonly models: readonly string[];
    readonly harnessVersion: string;
    readonly condition: string;
    readonly tries: number;
    readonly now: string;
  },
): Promise<number> {
  let queued = 0;
  for (const { key, revision } of plan.revisions)
    for (const model of plan.models)
      for (let t = 1; t <= plan.tries; t++)
        queued += (
          await db.run(
            `INSERT OR IGNORE INTO model_runs
              (revision, challenge_key, model, harness_version, condition, try, status, queued_at)
             VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)`,
            [revision, key, model, plan.harnessVersion, plan.condition, t, plan.now],
          )
        ).changes;
  return queued;
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
       ORDER BY queued_at, revision, model, try LIMIT 1`,
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
  },
  now: string,
): Promise<void> {
  const { changes } = await db.run(
    `UPDATE model_runs SET status = 'finished', outcome = ?, reason = ?, turns = ?, submissions = ?,
       finished_at = ?
     WHERE run_id = ? AND status = 'running'`,
    [result.outcome, result.reason, result.turns, result.submissions, now, runId],
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

/** Adds a model to the roster, or retires it; retiring keeps its runs. */
export async function setRoster(db: Sql, model: string, retired: boolean, now: string): Promise<void> {
  if (retired)
    await db.run("UPDATE model_roster SET retired_at = ? WHERE model = ? AND retired_at IS NULL", [now, model]);
  else
    await db.run(
      `INSERT INTO model_roster (model, added_at) VALUES (?, ?)
       ON CONFLICT(model) DO UPDATE SET retired_at = NULL`,
      [model, now],
    );
}

export interface SeriesCount {
  readonly model: string;
  readonly harness_version: string;
  readonly condition: string;
  readonly status: string;
  readonly outcome: string | null;
  readonly runs: number;
}

/** How many slots each series has, by status and outcome. */
export function summary(db: Sql): Promise<SeriesCount[]> {
  return db.all<SeriesCount>(
    `SELECT model, harness_version, condition, status, outcome, COUNT(*) AS runs
     FROM model_runs GROUP BY model, harness_version, condition, status, outcome
     ORDER BY model, harness_version, condition, status, outcome`,
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
