/** Internal scheduled-build seam only. Discovery is an upper bound, never eligibility evidence. */
import { CHALLENGE_KEY, REVISION } from "../domain/records";
import { MIN_COHORT } from "./cohort";
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
SELECT e.challenge, e.challenge_revision AS revision
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

/** Complete, bounded discovery result -> at most 99 exact builds. No truncation of an
 * incomplete/overflow response. Over 99 candidates means some FYIs expire; this bounds work, not a
 * promise of hourly coverage of every eligible revision.
 *
 * Order: with `refreshedAt` (each candidate's last successful snapshot write, from one listing of
 * the existing private snapshots), the stalest first: never-built, then oldest, then by challenge.
 * A revision left out by the cap or a deadline is therefore first in a later run. Without it (the
 * listing failed), a stateless hourly rotation still covers a stable set over a few hours.
 */
export function selectHourlyCohorts(
  raw: unknown,
  input: readonly CurrentCohortRevision[],
  now: Date,
  refreshedAt?: ReadonlyMap<string, number>,
): CurrentCohortRevision[] {
  const revisions = registry(input);
  if (
    !Array.isArray(raw) ||
    raw.length > revisions.length ||
    !Number.isFinite(now.getTime())
  )
    throw new Error("Invalid cohort discovery result.");
  const selected = new Set<string>();
  for (const row of raw) {
    if (
      !row ||
      typeof row !== "object" ||
      !revisions.some(
        (r) => r.challenge === row.challenge && r.revision === row.revision,
      ) ||
      selected.has(row.challenge)
    )
      throw new Error("Invalid cohort discovery result.");
    selected.add(row.challenge);
  }
  const candidates = revisions.filter((r) => selected.has(r.challenge));
  if (refreshedAt) {
    const at = (r: CurrentCohortRevision) =>
      refreshedAt.get(`${r.challenge}/${r.revision}`) ?? -Infinity;
    return [...candidates]
      .sort((a, b) => at(a) - at(b) || a.challenge.localeCompare(b.challenge))
      .slice(0, MAX_HOURLY_COHORT_BUILDS);
  }
  if (candidates.length <= MAX_HOURLY_COHORT_BUILDS) return candidates;
  const hour = Math.floor(now.getTime() / 3_600_000);
  const start =
    (((hour * MAX_HOURLY_COHORT_BUILDS) % candidates.length) +
      candidates.length) %
    candidates.length;
  return Array.from(
    { length: MAX_HOURLY_COHORT_BUILDS },
    (_, i) => candidates[(start + i) % candidates.length],
  );
}
