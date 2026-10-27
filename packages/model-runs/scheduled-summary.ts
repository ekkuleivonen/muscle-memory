import type { Sql } from "./ledger";
import { readModelReceipts, type ReceiptBucket } from "./read-receipts";
import { refreshModelSummaries } from "./summary-cache";

export interface SummaryEnvironment {
  MODEL_SUMMARY_CACHE_ENABLED?: string;
  CATALOG_DB?: { prepare(sql: string): {
    bind(...params: unknown[]): { all<T>(): Promise<{ results: T[] }> };
  } };
  CONTENT?: {
    get(key: string): Promise<{
      size: number; text(): Promise<string>; body: ReadableStream<Uint8Array>;
    } | null>;
    put(key: string, value: string): Promise<unknown>;
  };
}
/** Existing web bindings only. No human SQL, model calls, queue, or public trigger endpoint. */
export async function scheduledModelSummaries(env: SummaryEnvironment, scheduledTime: number) {
  if (env.MODEL_SUMMARY_CACHE_ENABLED !== "true") return { state: "disabled" as const };
  if (!env.CATALOG_DB || !env.CONTENT) return { state: "unconfigured" as const };
  const db: Sql = {
    all: async <T>(sql: string, params: readonly unknown[] = []) =>
      (await env.CATALOG_DB!.prepare(sql).bind(...params).all<T>()).results,
    run: async () => { throw new Error("Summary reader is read-only."); },
  };
  const rows = await db.all<{ challenge: string; revision: string }>(
    "SELECT challenge_key AS challenge, published_revision AS revision FROM challenge_heads WHERE lifecycle = 'published' AND published_revision IS NOT NULL ORDER BY challenge_key LIMIT 101",
  );
  if (rows.length > 100) return { state: "catalog-limit" as const };
  // Rotate the first revision each hour so a slow/malformed receipt cannot starve later keys.
  const start = rows.length ? Math.floor(scheduledTime / 3_600_000) % rows.length : 0;
  const revisions = [...rows.slice(start), ...rows.slice(0, start)];
  let gets = 0, bytes = 0;
  const bounded: ReceiptBucket = {
    get: async key => {
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
  const counts = await refreshModelSummaries(revisions, env.CONTENT,
    (key, revision) => readModelReceipts(db, bounded, key, revision, 5000));
  return { state: "finished" as const, ...counts, gets, bytes };
}
