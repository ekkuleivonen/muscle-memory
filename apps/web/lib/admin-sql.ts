import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  limitsFrom,
  QueryFailed,
  readSchema,
  runQuery,
  type Limits,
} from "../../../packages/workbench/read";
import { jsonBody } from "./model-runs-server";
import { sqlParser } from "./sql-parser";

/**
 * The SQL workbench's server side (docs/admin-sql.md). It reuses the statistics view's
 * read-only R2 SQL credential, `ADMIN_STATS_SQL_TOKEN`, against the events bucket only. Only
 * admin routes call it, after the Access check. Queries and results are never logged.
 */
async function env(): Promise<Record<string, unknown>> {
  return process.env.NODE_ENV === "development"
    ? (process.env as Record<string, unknown>)
    : ((await getCloudflareContext({ async: true })).env as unknown as Record<string, unknown>);
}

/** Queries in flight in this isolate. One operator, so a small number is plenty. */
const MAX_IN_FLIGHT = 2;
let inFlight = 0;

const json = (body: unknown, status = 200) => Response.json(body, { status });

async function bounded(
  run: (token: string, limits: Limits) => Promise<unknown>,
): Promise<Response> {
  const values = await env();
  const token = values.ADMIN_STATS_SQL_TOKEN;
  if (typeof token !== "string" || !token.trim())
    return json(
      { error: { kind: "unavailable", message: "The R2 SQL credential is not configured in this deployment." } },
      503,
    );
  if (inFlight >= MAX_IN_FLIGHT)
    return json(
      { error: { kind: "busy", message: `${MAX_IN_FLIGHT} queries are already running here; wait for one to finish.` } },
      429,
    );
  inFlight++;
  try {
    return json(await run(token, limitsFrom(values)));
  } catch (cause) {
    if (cause instanceof QueryFailed) {
      const status = { rejected: 400, sql: 400, timeout: 504, "too-large": 413, unavailable: 502 }[cause.failure.kind];
      return json({ error: cause.failure }, status);
    }
    // Anything else may quote the request or upstream; say only that it failed.
    return json({ error: { kind: "unavailable", message: "The query failed in the workbench's server." } }, 500);
  } finally {
    inFlight--;
  }
}

export async function workbenchQuery(request: Request): Promise<Response> {
  let sql: unknown;
  try {
    sql = (await jsonBody(request, 64 * 1024)).sql;
  } catch {
    return json({ error: { kind: "rejected", message: "Send {\"sql\": \"…\"} under 64 kB.", at: null } }, 400);
  }
  if (typeof sql !== "string")
    return json({ error: { kind: "rejected", message: "Send {\"sql\": \"…\"}.", at: null } }, 400);
  return bounded(async (token, limits) =>
    runQuery(token, sql as string, await sqlParser(), limits, fetch, request.signal),
  );
}

export async function workbenchSchema(request: Request): Promise<Response> {
  return bounded((token, limits) => readSchema(token, limits, fetch, request.signal));
}

/** Limits as the page states them. */
export async function workbenchLimits(): Promise<Limits & { configured: boolean }> {
  const values = await env();
  const token = values.ADMIN_STATS_SQL_TOKEN;
  return { ...limitsFrom(values), configured: typeof token === "string" && !!token.trim() };
}
