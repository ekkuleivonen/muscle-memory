import type { Sql } from "./ledger";
import { readModelReceipts, type ReceiptBucket } from "./read-receipts";
import {
  fairOrder,
  MODEL_SUMMARY_PREFIX,
  refreshModelSummaries,
  withinSummaryBudget,
} from "./summary-cache";

/** Registry bound (141 current revisions at launch), separate from per-run work. */
export const MAX_MODEL_SUMMARY_REVISIONS = 200;
/** Revisions attempted per run; the 250-read, 32 MiB and 45-second limits still stop it sooner. */
export const MAX_MODEL_REFRESHES = 100;
/**
 * Revisions each run takes from the fixed hourly rotation, attempted first. Each read is capped at
 * 5 s and the listing at 5 s, so these 4 always start inside the 45-second budget: every revision is
 * attempted at least once every ceil(n / 4) hours (36 for 141), whatever else fails or stalls.
 */
export const MODEL_ROTATION = 4;

export interface SummaryEnvironment {
  MODEL_SUMMARY_CACHE_ENABLED?: string;
  CATALOG_DB?: {
    prepare(sql: string): {
      bind(...params: unknown[]): { all<T>(): Promise<{ results: T[] }> };
    };
  };
  CONTENT?: {
    get(key: string): Promise<{
      size: number;
      text(): Promise<string>;
      body: ReadableStream<Uint8Array>;
    } | null>;
    put(key: string, value: string): Promise<unknown>;
    list?(options: { prefix: string; limit: number }): Promise<{
      objects: { key: string; uploaded: Date }[];
      truncated: boolean;
    }>;
  };
}
/** Existing web bindings only. No human SQL, model calls, queue, or public trigger endpoint. */
export async function scheduledModelSummaries(
  env: SummaryEnvironment,
  scheduledTime: number,
) {
  if (env.MODEL_SUMMARY_CACHE_ENABLED !== "true")
    return { state: "disabled" as const };
  if (!env.CATALOG_DB || !env.CONTENT)
    return { state: "unconfigured" as const };
  const deadline = Date.now() + 45000;
  const db: Sql = {
    all: async <T>(sql: string, params: readonly unknown[] = []) =>
      (
        await env
          .CATALOG_DB!.prepare(sql)
          .bind(...params)
          .all<T>()
      ).results,
    run: async () => {
      throw new Error("Summary reader is read-only.");
    },
  };
  const rows = await withinSummaryBudget(
    db.all<{ challenge: string; revision: string }>(
      `SELECT challenge_key AS challenge, published_revision AS revision FROM challenge_heads WHERE lifecycle = 'published' AND published_revision IS NOT NULL ORDER BY challenge_key LIMIT ${MAX_MODEL_SUMMARY_REVISIONS + 1}`,
    ),
    Math.max(0, deadline - Date.now()),
  );
  if (rows.length > MAX_MODEL_SUMMARY_REVISIONS)
    return { state: "catalog-limit" as const };
  // Rotation picks first, then stalest first from one listing of the snapshot prefix's keys and
  // upload times (fairOrder). The listing gets at most 5 s so it can't consume the run.
  let refreshedAt: Map<string, number> | null = null;
  try {
    const listed = env.CONTENT.list
      ? await withinSummaryBudget(
          env.CONTENT.list({ prefix: MODEL_SUMMARY_PREFIX, limit: 1000 }),
          Math.max(0, Math.min(5000, deadline - Date.now())),
        )
      : null;
    if (listed && !listed.truncated && Array.isArray(listed.objects)) {
      refreshedAt = new Map();
      for (const o of listed.objects)
        if (o.uploaded instanceof Date)
          refreshedAt.set(o.key.slice(MODEL_SUMMARY_PREFIX.length), o.uploaded.getTime());
    }
  } catch {
    refreshedAt = null;
  }
  const ordered = fairOrder(
    rows,
    (r) => `${r.challenge}/${r.revision}.json`,
    refreshedAt,
    Math.floor(scheduledTime / 3_600_000),
    MODEL_ROTATION,
    MAX_MODEL_REFRESHES,
  );
  const revisions = ordered.slice(0, MAX_MODEL_REFRESHES);
  let gets = 0,
    bytes = 0;
  const bounded: ReceiptBucket = {
    get: async (key) => {
      if (++gets > 250) throw new Error("Model receipt read limit reached.");
      const object = await env.CONTENT!.get(key);
      if (object) {
        bytes += object.size;
        if (bytes > 32 * 1024 * 1024) {
          await object.body.cancel();
          throw new Error("Model receipt byte limit reached.");
        }
      }
      return object;
    },
  };
  const counts = await refreshModelSummaries(
    revisions,
    env.CONTENT,
    (key, revision) =>
      readModelReceipts(
        db,
        bounded,
        key,
        revision,
        Math.min(5000, Math.max(0, deadline - Date.now())),
      ),
    // Each revision gets at most 5 s, so no slow receipt frontier can hold the run.
    { budgetMs: Math.max(0, deadline - Date.now()), rowMs: 5000 },
  );
  return {
    state: "finished" as const,
    ...counts,
    gets,
    bytes,
    registered: rows.length,
    /** Planned for this run (rotation picks first, then stalest); `attempted` is how many started. */
    planned: revisions.length,
    ordering: refreshedAt ? ("stalest-first" as const) : ("rotation" as const),
    // Not refreshed this run, whether by the per-run cap, a failure, a read limit or the deadline.
    notRefreshed: rows.length - counts.refreshed,
    complete: counts.refreshed === rows.length,
  };
}
