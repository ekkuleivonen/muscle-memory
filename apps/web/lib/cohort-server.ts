import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  COHORTS_ENABLED,
  COHORT_VERSION,
  ELIGIBILITY,
  MIN_COHORT,
  type CohortRead,
} from "../../../packages/statistics/cohort";
import { humanSummaryOnRequest, type HumanSummaryEnvironment } from "../../../packages/statistics/scheduled-cohorts";

export const empty = (state: CohortRead["state"]): CohortRead => ({
  state,
  version: COHORT_VERSION,
  minimum: MIN_COHORT,
  eligibility: ELIGIBILITY,
  readAt: new Date().toISOString(),
  groups: [],
});

/**
 * Suppressed human aggregates for one current revision. No participant input. While
 * COHORTS_ENABLED is false nothing below runs: no SQL and no CONTROL lookup.
 */
/**
 * A fresh private snapshot (at most an hour old, generation still current) is served as aggregates.
 * On a miss the answer is "unavailable" at once, and at most one bounded build of this revision per
 * hour and privacy generation (≤3 an hour, a lease shared by all isolates) runs after the response
 * via waitUntil; see
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
