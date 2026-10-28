/** Trusted server reducer. Member rows and eligibility revisions must never reach an HTTP response. */
import type { CohortWindow } from "./cohort-window";
import { safeIdentifier } from "../domain/capture";
import { cohortQuery, cohortResult, type CohortRead } from "./cohort";
/**
 * Members one build may check: 500 browsers keep the member query within its 1,000-row bound (a
 * first and a repeat unit each). Checked in batches of CHECK_BATCH, the existing check() limit.
 */
export const MAX_COHORT_MEMBERS = 500;
export const CHECK_BATCH = 100;
export interface EligibilityChecker {
  check(members: string[]): Promise<(string | null)[]>;
}

/** Fixed revision query with internal membership retained for current CONTROL checks. */
export function cohortMemberQuery(
  challenge: string,
  revision: string,
  window: CohortWindow,
): string {
  const query = cohortQuery(challenge, revision, window);
  return (
    query.slice(
      0,
      query.indexOf(
        "\nSELECT runtime, editor, diagnostics, practice, completed",
      ),
    ) +
    `
SELECT participant_id, runtime, editor, diagnostics, practice, completed, first_pass, submissions, 1 AS browsers
FROM one_per_browser WHERE pick = 1
LIMIT 1001`
  );
}

export async function currentCohort(
  query: () => Promise<unknown>,
  checker: EligibilityChecker,
  /** The members this build reserved CONTROL work for; more fails closed rather than overspend. */
  maxMembers = MAX_COHORT_MEMBERS,
): Promise<CohortRead> {
  const raw = await query();
  if (!Array.isArray(raw) || raw.length > 1000)
    throw new Error("Comparison budget exceeded.");
  const rows: Record<string, unknown>[] = [];
  const ids = new Set<string>();
  const units = new Set<string>();
  for (const row of raw) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.participant_id !== "string"
    )
      throw new Error("Invalid member row.");
    safeIdentifier(row.participant_id);
    const unit = JSON.stringify([row.participant_id, row.practice]);
    if (units.has(unit)) throw new Error("Duplicate browser unit.");
    units.add(unit);
    ids.add(row.participant_id);
    rows.push(row);
  }
  if (ids.size > Math.min(MAX_COHORT_MEMBERS, maxMembers))
    throw new Error("Comparison budget exceeded.");
  const members = [...ids];
  const valid = (v: unknown, n: number): v is (string | null)[] =>
    Array.isArray(v) &&
    v.length === n &&
    v.every(
      (r) => r === null || (typeof r === "string" && /^[a-f0-9-]{36}$/.test(r)),
    );
  // Every member, in fixed batches of at most CHECK_BATCH IDs; never a sample.
  const checkAll = async () => {
    const out: (string | null)[] = [];
    for (let i = 0; i < members.length; i += CHECK_BATCH) {
      const batch = members.slice(i, i + CHECK_BATCH);
      const answer = await checker.check(batch);
      if (!valid(answer, batch.length))
        throw new Error("Invalid privacy control response.");
      out.push(...answer);
    }
    return out;
  };
  const before = await checkAll();
  const eligible = new Set(members.filter((_, i) => before[i] !== null));
  const result = cohortResult(
    rows
      .filter((r) => eligible.has(r.participant_id as string))
      .map((r) => ({ ...r, browsers: 1 })),
  );
  const after = await checkAll();
  if (after.some((r, i) => r !== before[i]))
    throw new Error("Privacy changed during comparison.");
  return result;
}
