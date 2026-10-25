import type { WorkspaceRecord } from "../../../packages/domain/workspace";
import { attemptRecords } from "./attempts";
import { completions } from "./completion";
import { metricsOf } from "./result";

/** Reuse the existing hint metric, bounded to the recorded completion's original attempt/time. */
export function profileCompletions(records: readonly WorkspaceRecord[]) {
  return completions(records)
    .reverse()
    .map((completion) => ({
      ...completion,
      hints: metricsOf(
        attemptRecords(records, completion.issue, completion.at),
        completion.issue,
        completion.at,
        () => undefined, // Hint counting needs no published hint text or other revision content.
      ).h,
    }));
}
