import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  COHORTS_ENABLED,
  COHORT_VERSION,
  ELIGIBILITY,
  MIN_COHORT,
  type CohortRead,
} from "../../../packages/statistics/cohort";
import {
  currentCohort,
  cohortMemberQuery,
  type EligibilityChecker,
} from "../../../packages/statistics/current-cohort";
import { syntheticRevisions } from "../../../packages/statistics/exclusions";
import type { CatalogDatabase } from "../../../packages/authoring/storage";

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
export async function cohort(
  challenge: string,
  revision: string,
  current: boolean,
): Promise<CohortRead> {
  if (!COHORTS_ENABLED) return empty("disabled");
  // Only each challenge's current revision is a cohort key: at most one per published challenge.
  if (!current) return empty("earlier-version");
  const env =
    process.env.NODE_ENV === "development"
      ? (process.env as Record<string, unknown>)
      : ((await getCloudflareContext({ async: true })).env as unknown as Record<
          string,
          unknown
        >);
  const token = env.ADMIN_STATS_SQL_TOKEN;
  const db = env.CATALOG_DB as CatalogDatabase | undefined;
  const checker = env.COMPARISON_ELIGIBILITY as EligibilityChecker | undefined;
  if (typeof token !== "string" || !token.trim() || !db || !checker)
    return empty("unavailable");
  const key = `${challenge}/${revision}`;
  const now = Date.now();
  for (const [k, at] of recent) if (now - at >= 60_000) recent.delete(k);
  if (active >= 2 || recent.has(key) || recent.size >= 128)
    return empty("unavailable");
  recent.set(key, now);
  const read = (async () => {
    active++;
    try {
      // Synthetic QA revisions are never a human cohort.
      const registry = await db
        .prepare(
          "SELECT challenge_key, revision, metadata_json FROM published_versions WHERE challenge_key = ? AND revision = ?",
        )
        .bind(challenge, revision)
        .all<{
          challenge_key: string;
          revision: string;
          metadata_json: string;
        }>();
      if (syntheticRevisions(registry.results ?? []).length)
        return empty("ready");
      return await currentCohort(async () => {
        const response = await fetch(
          "https://api.sql.cloudflarestorage.com/api/v1/accounts/166fd3dff06a9c3f1aef172a25db7ace/basin-sql/query/muscle-memory-events",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: cohortMemberQuery(challenge, revision),
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
      }, checker);
    } catch {
      // SQL errors can quote private expressions. Never log or return them, and never fall back
      // to an expired aggregate.
      return empty("unavailable");
    } finally {
      active--;
    }
  })();
  return read;
}
