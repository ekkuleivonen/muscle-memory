/** Trusted server reducer. Member rows and eligibility revisions must never reach an HTTP response. */
import { safeIdentifier } from "../domain/capture";
import { cohortQuery, cohortResult, type CohortRead } from "./cohort";
export const MAX_COHORT_MEMBERS = 100;
export interface EligibilityChecker {
  check(members: string[]): Promise<(string | null)[]>;
}

/** Fixed revision query with internal membership retained for current CONTROL checks. */
export function cohortMemberQuery(challenge: string, revision: string): string {
  const query = cohortQuery(challenge, revision);
  return (
    query.slice(
      0,
      query.indexOf("\nSELECT runtime, diagnostics, practice, completed"),
    ) +
    `
SELECT participant_id, runtime, diagnostics, practice, completed, first_pass, submissions, 1 AS browsers
FROM one_per_browser WHERE pick = 1
LIMIT 1001`
  );
}

export async function currentCohort(
  query: () => Promise<unknown>,
  checker: EligibilityChecker,
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
  if (ids.size > MAX_COHORT_MEMBERS)
    throw new Error("Comparison budget exceeded.");
  const members = [...ids];
  const before = await checker.check(members);
  const valid = (v: unknown): v is (string | null)[] =>
    Array.isArray(v) &&
    v.length === members.length &&
    v.every(
      (r) => r === null || (typeof r === "string" && /^[a-f0-9-]{36}$/.test(r)),
    );
  if (!valid(before)) throw new Error("Invalid privacy control response.");
  const eligible = new Set(members.filter((_, i) => before[i] !== null));
  const result = cohortResult(
    rows
      .filter((r) => eligible.has(r.participant_id as string))
      .map((r) => ({ ...r, browsers: 1 })),
  );
  const after = await checker.check(members);
  if (!valid(after) || after.some((r, i) => r !== before[i]))
    throw new Error("Privacy changed during comparison.");
  return result;
}
