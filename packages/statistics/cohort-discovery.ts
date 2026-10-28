/** Internal scheduled-build seam only. Discovery is an upper bound, never eligibility evidence. */
import { CHALLENGE_KEY, REVISION } from "../domain/records";
import { MIN_COHORT } from "./cohort";
import { CHECK_BATCH, MAX_COHORT_MEMBERS } from "./current-cohort";
import { checkCohortWindow, type CohortWindow } from "./cohort-window";

/**
 * Registry bound, separate from the query budget: one discovery query names every current revision
 * (141 at launch), so this caps the size of that one query, not the number of queries. Over it the
 * human refresh stops whole rather than silently dropping revisions.
 */
export const MAX_CURRENT_COHORT_REVISIONS = 200;
/** One discovery + at most 99 exact scans keeps the hourly run at 100 SQL queries. */
export const MAX_HOURLY_COHORT_BUILDS = 99;
export interface CurrentCohortRevision {
  challenge: string;
  revision: string;
  window: CohortWindow;
}

function registry(
  input: readonly CurrentCohortRevision[],
): CurrentCohortRevision[] {
  if (!input.length || input.length > MAX_CURRENT_COHORT_REVISIONS)
    throw new Error("Invalid current revision registry.");
  const keys = new Set<string>();
  const result = input.map(({ challenge, revision, window }) => {
    if (
      !CHALLENGE_KEY.test(challenge) ||
      !REVISION.test(revision) ||
      keys.has(challenge)
    )
      throw new Error("Invalid current revision registry.");
    keys.add(challenge);
    return { challenge, revision, window: checkCohortWindow(window) };
  });
  if (result.some((r) => r.window.to !== result[0].window.to))
    throw new Error("Discovery requires one server-selected cutoff.");
  return result.sort((a, b) => a.challenge.localeCompare(b.challenge));
}

/** One fixed event scan for all validated current revisions, no JSON/raw rows/member IDs returned.
 * The scheduler supplies only its trusted published registry, excluding synthetic revisions.
 * Missing starts cannot contribute to the exact query, so <20 distinct starters is a safe skip.
 * Models, conflicts, tool mismatches and current exclusions may overcount discovery; the exact
 * query plus CONTROL must still prove every metric's eligibility and denominator.
 */
export function cohortDiscoveryQuery(
  input: readonly CurrentCohortRevision[],
): string {
  const revisions = registry(input);
  const from = revisions.reduce(
    (earliest, r) => (r.window.from < earliest ? r.window.from : earliest),
    revisions[0].window.from,
  );
  const current = revisions
    .map(
      (r) =>
        `SELECT '${r.challenge}' AS challenge, '${r.revision}' AS revision, '${r.window.from}' AS since`,
    )
    .join("\nUNION ALL\n");
  return `WITH current_revisions AS (
${current}
)
SELECT e.challenge, e.challenge_revision AS revision, COUNT(DISTINCT e.participant_id) AS browsers
FROM default.events e JOIN current_revisions c
  ON e.challenge = c.challenge AND e.challenge_revision = c.revision
WHERE e.kind = 'observation' AND e.type = 'practice.started'
  AND e.participant_id IS NOT NULL AND e.participant_id <> ''
  AND e.received_at >= '${from}' AND e.received_at < '${revisions[0].window.to}'
  AND e.occurred_at >= '${from}' AND e.occurred_at < '${revisions[0].window.to}'
  AND e.received_at >= c.since AND e.occurred_at >= c.since
GROUP BY e.challenge, e.challenge_revision
HAVING COUNT(DISTINCT e.participant_id) >= ${MIN_COHORT}
ORDER BY e.challenge, e.challenge_revision
LIMIT ${MAX_CURRENT_COHORT_REVISIONS + 1}`;
}

/**
 * CONTROL work per hourly run, in slots: one slot is one check() batch of up to 100 IDs before and
 * one after. A build reserves ceil(potential browsers / 100) slots, so a large cohort uses several
 * slots and fewer revisions are built that run; the total never grows. 14 slots keep a run at
 * 1 generation read + 2 × 14 check calls = 29 service-binding calls, inside the documented limit
 * of 32 Worker invocations per request (the run's own invocation included). CONTROL reads per run
 * are at most 14 × 2 × 100 × 3 = 8,400, under the earlier 59,400 ceiling.
 */
export const RUN_CHECK_SLOTS = 14;
export interface PlannedCohort extends CurrentCohortRevision {
  /** Potential browsers from discovery: an upper bound on the build's members. */
  browsers: number;
  slots: number;
}
export interface CohortPlan {
  builds: PlannedCohort[];
  /** Candidates over MAX_COHORT_MEMBERS potential browsers: never built (fail closed). */
  oversized: number;
  /** Candidates that fit but not this run (slots or the build cap); first in a later run. */
  deferred: number;
  slots: number;
}

/**
 * Complete, bounded discovery result -> a plan within RUN_CHECK_SLOTS and MAX_HOURLY_COHORT_BUILDS.
 * No truncation of an incomplete/overflow response. Not every eligible revision is refreshed each
 * hour; the plan says how many were left out and why.
 *
 * Order: with `refreshedAt` (each candidate's last successful snapshot write, from one listing of
 * the existing private snapshots), the stalest first: never-built, then oldest, then by challenge.
 * Without it (the listing failed), a stateless hourly rotation. Candidates are taken in that order
 * while their slots fit; a larger one that doesn't fit is deferred and smaller ones still go, and
 * as the stalest it leads the next run.
 */
export function planHourlyCohorts(
  raw: unknown,
  input: readonly CurrentCohortRevision[],
  now: Date,
  refreshedAt?: ReadonlyMap<string, number>,
  slotBudget = RUN_CHECK_SLOTS,
): CohortPlan {
  const revisions = registry(input);
  if (
    !Array.isArray(raw) ||
    raw.length > revisions.length ||
    !Number.isFinite(now.getTime())
  )
    throw new Error("Invalid cohort discovery result.");
  const potential = new Map<string, number>();
  for (const row of raw) {
    const browsers = Number(row?.browsers);
    if (
      !row ||
      typeof row !== "object" ||
      !revisions.some(
        (r) => r.challenge === row.challenge && r.revision === row.revision,
      ) ||
      potential.has(row.challenge) ||
      !Number.isSafeInteger(browsers) ||
      browsers < MIN_COHORT
    )
      throw new Error("Invalid cohort discovery result.");
    potential.set(row.challenge, browsers);
  }
  const candidates = revisions.filter((r) => potential.has(r.challenge));
  let ordered: CurrentCohortRevision[];
  if (refreshedAt) {
    const at = (r: CurrentCohortRevision) =>
      refreshedAt.get(`${r.challenge}/${r.revision}`) ?? -Infinity;
    ordered = [...candidates].sort(
      (a, b) => at(a) - at(b) || a.challenge.localeCompare(b.challenge),
    );
  } else {
    const hour = Math.floor(now.getTime() / 3_600_000);
    const start = candidates.length
      ? (((hour * slotBudget) % candidates.length) + candidates.length) %
        candidates.length
      : 0;
    ordered = [...candidates.slice(start), ...candidates.slice(0, start)];
  }
  const plan: CohortPlan = { builds: [], oversized: 0, deferred: 0, slots: 0 };
  for (const r of ordered) {
    const browsers = potential.get(r.challenge)!;
    if (browsers > MAX_COHORT_MEMBERS) {
      plan.oversized++;
      continue;
    }
    const slots = Math.ceil(browsers / CHECK_BATCH);
    if (
      plan.slots + slots > slotBudget ||
      plan.builds.length === MAX_HOURLY_COHORT_BUILDS
    ) {
      plan.deferred++;
      continue;
    }
    plan.builds.push({ ...r, browsers, slots });
    plan.slots += slots;
  }
  return plan;
}
