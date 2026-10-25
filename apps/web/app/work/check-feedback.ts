import type { CaseResult } from "../../../../packages/runner/runner";

/** Public categories only: hidden-case values, names, messages and traces never reach UI. */
export function privateCheckFailure(result?: CaseResult): string {
  if (result?.error) return "Raised an error. Review the public requirements.";
  if (result?.conversionError)
    return "Returned a value that could not be converted.";
  if (result?.unserializable)
    return "Returned a value that cannot be checked as JSON.";
  if (!result?.output) return "Did not return a result.";
  return "Returned an incorrect result. Review the public requirements.";
}
