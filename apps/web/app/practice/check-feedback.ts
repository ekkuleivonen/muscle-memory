import type { CaseResult } from "../../../../packages/runner/runner";
import { failureOf, failureText } from "../../lib/diagnosis";

/** Shared fixed categories: hidden values, names, error types and traces never reach UI. */
export function privateCheckFailure(result?: CaseResult): string {
  return failureText(failureOf(result));
}
