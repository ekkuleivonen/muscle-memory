import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Sql } from "../../../packages/model-runs/ledger";

/**
 * The model runner's storage (docs/model-runs.md): the run ledger in the catalog D1 database
 * (migrations/catalog/0002_model_runs.sql) and finished runs' rows in the private content
 * bucket under `model-runs/outbox/`, from where tools/model-runs/store_events.py appends them
 * to `default.model_events`. Only operator routes reach it.
 */
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
interface ModelRunsEnv {
  CATALOG_DB?: { prepare(sql: string): D1Statement };
  CONTENT?: {
    put(key: string, value: string, options?: { onlyIf?: { etagDoesNotMatch: string } }): Promise<unknown | null>;
  };
}

export class ModelRunsUnavailable extends Error {}

async function env(): Promise<Required<ModelRunsEnv>> {
  const value = (await getCloudflareContext({ async: true })).env as unknown as ModelRunsEnv;
  if (!value.CATALOG_DB || !value.CONTENT)
    throw new ModelRunsUnavailable("The catalog database and content bucket are not configured.");
  return value as Required<ModelRunsEnv>;
}

/** The ledger over the D1 binding. */
export async function ledgerDb(): Promise<Sql> {
  const db = (await env()).CATALOG_DB;
  return {
    all: async <T>(sql: string, params: readonly unknown[] = []) =>
      (await db.prepare(sql).bind(...params).all<T>()).results,
    run: async (sql, params = []) => ({
      changes: (await db.prepare(sql).bind(...params).run()).meta.changes,
    }),
  };
}

/** Stores a finished run's rows once: a retry of the same run finds them there. */
export async function storeRun(runId: string, ndjson: string): Promise<void> {
  await (await env()).CONTENT.put(`model-runs/outbox/${runId}.ndjson`, ndjson, {
    onlyIf: { etagDoesNotMatch: "*" },
  });
}

/** A JSON object body, refused over `limit` bytes. */
export async function jsonBody(request: Request, limit: number): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > limit) throw new RangeError("Request body too large.");
  const text = await request.text();
  if (text.length > limit) throw new RangeError("Request body too large.");
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Expected an object.");
  return value as Record<string, unknown>;
}
