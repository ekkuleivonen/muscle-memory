import type { Revision } from "../../../packages/content/model";
import type { WorkspaceRecord } from "../../../packages/domain/workspace";
import { attemptRecords } from "./attempts";
import { completionEligibility, completions } from "./completion";

/** Sharing needs a recorded completion and a successful gate from the same record snapshot. */
export function shareCompletionProof(input: {
  records: readonly WorkspaceRecord[];
  issue: string;
  revision: string;
  revisionFor: (id: string) => Revision | undefined;
  currentFiles: Readonly<Record<string, string>>;
  ready: boolean;
}) {
  if (!input.ready) return null;
  const completion = completions(
    attemptRecords(input.records, input.issue),
    input.issue,
  ).at(-1);
  if (!completion?.automatic || completion.revision !== input.revision)
    return null;
  const gate = completionEligibility(input);
  if (
    gate.blocker !== null ||
    gate.latest?.runId !== completion.runId ||
    gate.latest.issueRevision !== completion.revision ||
    gate.completedAt !== completion.at ||
    gate.required.length !== 0
  )
    return null;
  return { completion, required: gate.required };
}
