import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  COHORTS_ENABLED,
  COHORT_VERSION,
  ELIGIBILITY,
  MIN_COHORT,
  type CohortRead,
} from "../../../packages/statistics/cohort";
import { cohortMemberQuery } from "../../../packages/statistics/current-cohort";
import { readCohortBuildSpec } from "../../../packages/statistics/cohort-source";
import { humanSummaryOnRequest, type HumanSummaryEnvironment } from "../../../packages/statistics/scheduled-cohorts";
import {
  buildHumanSnapshot,
  type ComparisonControl,
  type HumanSnapshot,
} from "../../../packages/statistics/human-snapshot";
import type {
  CatalogDatabase,
  ContentBucket,
} from "../../../packages/authoring/storage";

/** No result cache: every draft read consults current CONTROL state. */
const recent = new Map<string, number>();
let active = 0;
export const empty = (state: CohortRead["state"]): CohortRead => ({
  state,
  version: COHORT_VERSION,
  minimum: MIN_COHORT,
  eligibility: ELIGIBILITY,
  readAt: new Date().toISOString(),
  groups: [],
});

/**
 * Suppressed human aggregates for one registered revision, with web's existing read-only SQL
 * token (the admin statistics and private-history credential). No participant input. Disabled
 * pending the control-authority approval and publication guarantee in docs/eng-376-current-privacy.md.
 * While disabled no SQL or CONTROL lookup runs.
 */
/**
 * A fresh private snapshot (at most an hour old, generation still current) is served as aggregates.
 * On a miss the answer is "unavailable" at once, and at most one bounded build of this revision per
 * hour (a lease shared by all isolates) runs after the response via waitUntil; see
 * humanSummaryOnRequest. The page never waits on SQL, and no stale snapshot stands in.
 */
export async function cohort(
  challenge: string,
  revision: string,
  current: boolean,
  runtime?: Record<string, string>,
): Promise<CohortRead> {
  if (!COHORTS_ENABLED) return empty("disabled");
  if (!current) return empty("earlier-version");
  if (!runtime) return empty("unavailable");
  try {
    const { env, ctx } = await getCloudflareContext({ async: true });
    return (
      (await humanSummaryOnRequest(
        env as unknown as HumanSummaryEnvironment,
        challenge,
        revision,
        runtime,
        (work) => ctx.waitUntil(work),
      )) ?? empty("unavailable")
    );
  } catch { return empty("unavailable"); }
}

/** Internal candidate computation only; no HTTP caller or scheduler is added here. */
export async function precomputeCohort(
  challenge: string,
  revision: string,
  current: boolean,
): Promise<HumanSnapshot | null> {
  if (!COHORTS_ENABLED) return null;
  // Only each challenge's current revision is a cohort key: at most one per published challenge.
  if (!current) return null;
  const env =
    process.env.NODE_ENV === "development"
      ? (process.env as Record<string, unknown>)
      : ((await getCloudflareContext({ async: true })).env as unknown as Record<
          string,
          unknown
        >);
  const token = env.ADMIN_STATS_SQL_TOKEN;
  const db = env.CATALOG_DB as CatalogDatabase | undefined;
  const content = env.CONTENT as ContentBucket | undefined;
  const checker = env.COMPARISON_ELIGIBILITY as ComparisonControl | undefined;
  if (typeof token !== "string" || !token.trim() || !db || !content || !checker)
    return null;
  const key = `${challenge}/${revision}`;
  const now = Date.now();
  for (const [k, at] of recent) if (now - at >= 60_000) recent.delete(k);
  if (active >= 2 || recent.has(key) || recent.size >= 128) return null;
  recent.set(key, now);
  const read = (async () => {
    active++;
    try {
      const spec = await readCohortBuildSpec(db, content, challenge, revision);
      if (!spec) return null;
      return await buildHumanSnapshot(
        spec,
        async () => {
          const response = await fetch(
            "https://api.sql.cloudflarestorage.com/api/v1/accounts/166fd3dff06a9c3f1aef172a25db7ace/basin-sql/query/muscle-memory-events",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                query: cohortMemberQuery(challenge, revision, spec.window),
              }),
              cache: "no-store",
              redirect: "manual",
              signal: AbortSignal.timeout(15000),
            },
          );
          if (!response.ok) throw new Error();
          if (!response.body) throw new Error();
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > 1024 * 1024) throw new Error();
              chunks.push(value);
            }
          } finally {
            await reader.cancel().catch(() => {});
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const c of chunks) {
            bytes.set(c, offset);
            offset += c.length;
          }
          const body = JSON.parse(new TextDecoder().decode(bytes));
          if (body?.success !== true) throw new Error();
          return body.result?.rows;
        },
        checker,
      );
    } catch {
      // SQL errors can quote private expressions. Never log or return them, and never fall back
      // to an expired aggregate.
      return null;
    } finally {
      active--;
    }
  })();
  return read;
}
