/**
 * What a Submit says: whether every case passed, and which rules the submitted code fires. A
 * submission is complete when both hold: every case passed and no rule fires. Read from the
 * submitted code and its run alone, so it is the same for everyone and every time.
 */
import type { Revision, Rule } from "../../../packages/content/model";
import { broken } from "../../../packages/content/rules";
import { submitResult, type SubmitResult } from "../../../packages/domain/practice";

export interface Verdict {
  readonly result: SubmitResult;
  readonly passed: number;
  readonly total: number;
  /** Rules the submitted code fires, in the revision's order. */
  readonly rules: readonly Rule[];
  readonly complete: boolean;
}

export function verdictOf(
  revision: Revision,
  outcome: Parameters<typeof submitResult>[1],
  files: Readonly<Record<string, string>>,
): Verdict {
  const { result, passed, total } = submitResult(revision.checks.cases, outcome);
  const rules = broken(revision.checks.rules, files);
  return { result, passed, total, rules, complete: result === "passed" && !rules.length };
}
