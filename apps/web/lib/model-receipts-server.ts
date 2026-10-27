import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  readModelReceipts,
  type ReceiptBucket,
  type ReceiptRead,
} from "../../../packages/model-runs/read-receipts";
import type { Sql } from "../../../packages/model-runs/ledger";
const cache = new Map<string, { until: number; result: ReceiptRead }>();
const inFlight = new Map<string, Promise<ReceiptRead>>();
/** Uses existing catalog/content bindings; no new credentials or model execution. */
export async function modelReceipts(
  key: string,
  revision: string,
): Promise<ReceiptRead> {
  const empty = (state: ReceiptRead["state"]): ReceiptRead => ({
    state,
    receipts: [],
    truncated: false,
    readAt: new Date().toISOString(),
  });
  if (
    process.env.NODE_ENV === "development" &&
    process.env.CATALOG_MODE !== "managed"
  )
    return empty("unconfigured");
  try {
    const env = (await getCloudflareContext({ async: true }))
      .env as unknown as {
      CATALOG_DB?: {
        prepare(sql: string): {
          bind(...params: unknown[]): { all<T>(): Promise<{ results: T[] }> };
        };
      };
      CONTENT?: ReceiptBucket;
    };
    if (!env.CATALOG_DB || !env.CONTENT) return empty("unconfigured");
    const cacheKey = `${key}:${revision}`;
    const found = cache.get(cacheKey);
    if (found && found.until > Date.now()) return found.result;
    const pending = inFlight.get(cacheKey);
    if (pending) return await pending;
    if (inFlight.size >= 2) return empty("unavailable");
    const db: Sql = {
      all: async <T>(sql: string, params: readonly unknown[] = []) =>
        (
          await env
            .CATALOG_DB!.prepare(sql)
            .bind(...params)
            .all<T>()
        ).results,
      run: async () => {
        throw new Error("Receipt reader is read-only.");
      },
    };
    const load = readModelReceipts(db, env.CONTENT, key, revision)
      .then((result) => {
        if (cache.size >= 32) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, { until: Date.now() + 60000, result });
        return result;
      })
      .finally(() => inFlight.delete(cacheKey));
    inFlight.set(cacheKey, load);
    return await load;
  } catch {
    return empty("unavailable");
  } // Never log or return upstream/private errors.
}
