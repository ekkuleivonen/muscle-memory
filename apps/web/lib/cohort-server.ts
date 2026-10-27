import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  COHORTS_ENABLED,
  COHORT_VERSION,
  MIN_COHORT,
  cohortQuery,
  cohortResult,
  type CohortRead,
} from "../../../packages/statistics/cohort";
import { syntheticRevisions } from "../../../packages/statistics/exclusions";
import type { CatalogDatabase } from "../../../packages/authoring/storage";

/** Aggregates change slowly and every read scans: one query per revision per hour per isolate. */
const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { read: CohortRead; at: number }>();
const inflight = new Map<string, Promise<CohortRead>>();
let active = 0;
const empty = (state: CohortRead["state"]): CohortRead => ({
  state,
  version: COHORT_VERSION,
  minimum: MIN_COHORT,
  readAt: new Date().toISOString(),
  groups: [],
});

/**
 * Suppressed human aggregates for one registered revision, with web's existing read-only SQL
 * token (the admin statistics and private-history credential). No participant input. Disabled
 * until the owner approves the policy in docs/human-cohorts.md: then no SQL runs at all.
 */
export async function cohort(challenge: string, revision: string): Promise<CohortRead> {
  if (!COHORTS_ENABLED) return empty("disabled");
  const env =
    process.env.NODE_ENV === "development"
      ? (process.env as Record<string, unknown>)
      : ((await getCloudflareContext({ async: true })).env as unknown as Record<string, unknown>);
  const token = env.ADMIN_STATS_SQL_TOKEN;
  const db = env.CATALOG_DB as CatalogDatabase | undefined;
  if (typeof token !== "string" || !token.trim() || !db) return empty("unavailable");
  const key = `${challenge}/${revision}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.read;
  const pending = inflight.get(key);
  if (pending) return pending;
  if (active >= 2) return hit?.read ?? empty("unavailable");
  const read = (async () => {
    active++;
    try {
      // Synthetic QA revisions are never a human cohort.
      const registry = await db
        .prepare("SELECT challenge_key, revision, metadata_json FROM published_versions WHERE challenge_key = ? AND revision = ?")
        .bind(challenge, revision)
        .all<{ challenge_key: string; revision: string; metadata_json: string }>();
      if (syntheticRevisions(registry.results ?? []).length) return empty("ready");
      const response = await fetch(
        "https://api.sql.cloudflarestorage.com/api/v1/accounts/166fd3dff06a9c3f1aef172a25db7ace/basin-sql/query/muscle-memory-events",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: cohortQuery(challenge, revision) }),
          cache: "no-store",
          redirect: "manual",
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw new Error();
      const text = await response.text();
      if (text.length > 1024 * 1024) throw new Error();
      const body = JSON.parse(text);
      if (body?.success !== true) throw new Error();
      const result = cohortResult(body.result?.rows);
      if (cache.size >= 64) cache.delete(cache.keys().next().value!);
      cache.set(key, { read: result, at: Date.now() });
      return result;
    } catch {
      // SQL errors can quote private expressions. Never log or return them.
      return hit?.read ?? empty("unavailable");
    } finally {
      active--;
      inflight.delete(key);
    }
  })();
  inflight.set(key, read);
  return read;
}
