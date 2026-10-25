/**
 * Whether a pull request can be merged now: one pure answer from the attempt's own records,
 * used by the merge button and checked again by the merge itself. CI and review are separate
 * requirements, as with branch protection: Resolve clears findings and never anything else.
 *
 * CI counts only if it checked what would be merged, against what the person is working on:
 * - the latest push by its push number, so a late result from an older push never counts;
 * - no newer push still waiting for its checks;
 * - the revision that push ran against is published, and is the one this attempt last opened
 *   the IDE on (a pinned earlier revision stays valid; the live one is never swapped in);
 * - the code saved since is exactly the code pushed.
 */
import { latestSavedCode } from "../../../packages/capture/restore";
import type { WorkspaceRecord } from "../../../packages/domain/workspace";

export type MergeBlocker =
  /** Merged or closed already. */
  | "not-open"
  /** Another pull request of this attempt was merged. */
  | "other-merged"
  /** A newer push has not reported its checks. */
  | "checks-pending"
  /** The latest push's checks don't all pass. */
  | "checks"
  /** The checks ran against a revision this attempt is no longer on, or one not published. */
  | "revision"
  /** The code was changed after the latest push. */
  | "code-changed"
  /** The saved code could not be compared with the push. */
  | "code-unconfirmed"
  /** A finding still needs resolving. */
  | "review";

export interface LatestPush {
  push: number;
  runId: string;
  issueRevision: string;
  codeArtifactId: string;
  result: string;
  passed: number;
  total: number;
}

export interface MergeEligibility {
  blocker: MergeBlocker | null;
  /** The push merging would ship, if any was recorded. */
  latest: LatestPush | null;
}

interface Observation {
  type: string;
  occurredAt: string;
  sequence: number;
  issue: string | null;
  issueRevision: string | null;
  data: Record<string, unknown>;
}

function observationsOf(records: readonly WorkspaceRecord[], issue: string): Observation[] {
  const out: Observation[] = [];
  for (const record of records) {
    if (record.kind !== "observation") continue;
    try {
      const value = JSON.parse(record.payload);
      if (value?.issue !== issue || typeof value.occurredAt !== "string") continue;
      out.push({
        type: String(value.type),
        occurredAt: value.occurredAt,
        sequence: Number(value.source?.sequence ?? 0),
        issue: value.issue,
        issueRevision: typeof value.issueRevision === "string" ? value.issueRevision : null,
        data: value.data ?? {},
      });
    } catch {
      // An unreadable record is not evidence of anything.
    }
  }
  return out.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.sequence - b.sequence);
}

/** The pushed files, or null when the artifact is missing, unreadable or truncated. */
function pushedFiles(
  records: readonly WorkspaceRecord[],
  artifactId: string,
): { participantId: string; files: Record<string, string> } | null {
  const record = records.find((r) => r.kind === "artifact" && r.recordId === artifactId);
  if (!record) return null;
  try {
    const value = JSON.parse(record.payload);
    if (value.truncated) return null;
    const files: Record<string, string> = {};
    for (const [path, file] of Object.entries(
      (value.files ?? {}) as Record<string, { text?: unknown; capture?: { truncated?: boolean } }>,
    )) {
      if (file.capture?.truncated || typeof file.text !== "string") return null;
      files[path] = file.text;
    }
    return { participantId: record.participantId, files };
  } catch {
    return null;
  }
}

export function mergeEligibility(input: {
  /** The pull request's attempt (see lib/attempts). */
  records: readonly WorkspaceRecord[];
  /** The issue's permanent id. */
  issue: string;
  number: number;
  pull: { state: string; otherMerged?: number };
  /** Whether a revision of this issue is published. */
  published: (revision: string) => boolean;
  /** Open findings that must be resolved first (lib/feedback openRequired). */
  openRequired: number;
}): MergeEligibility {
  const { records, issue, number, pull } = input;
  const own = observationsOf(records, issue);
  const pushes = own.filter(
    (o) => o.type === "observation.workspace.pull-request" && Number(o.data.number) === number,
  );
  // The latest push by its number: a result that arrives late for an older push never wins.
  const newest = pushes.reduce<Observation | null>(
    (best, o) =>
      !best || Number(o.data.push) > Number(best.data.push) ||
      (Number(o.data.push) === Number(best.data.push) && o.occurredAt >= best.occurredAt)
        ? o
        : best,
    null,
  );
  const latest: LatestPush | null = newest && {
    push: Number(newest.data.push),
    runId: String(newest.data.runId),
    issueRevision: newest.issueRevision ?? "",
    codeArtifactId: String(newest.data.codeArtifactId),
    result: String(newest.data.result),
    passed: Number(newest.data.passed),
    total: Number(newest.data.total),
  };
  const blocked = (blocker: MergeBlocker): MergeEligibility => ({ blocker, latest });

  if (pull.state !== "open") return blocked("not-open");
  if (pull.otherMerged) return blocked("other-merged");
  if (!latest) return blocked("checks-pending");

  // A push started after the latest reported one and never reported: its checks are pending.
  const reported = new Set(
    own
      .filter((o) => o.type === "observation.workspace.pull-request")
      .map((o) => String(o.data.runId)),
  );
  const started = (runId: string) =>
    own.find(
      (o) => o.type === "observation.workspace.run" && String(o.data.runId) === runId,
    )?.occurredAt ?? newest!.occurredAt;
  const since = started(latest.runId);
  if (
    own.some(
      (o) =>
        o.type === "observation.workspace.run" &&
        o.data.purpose === "pull-request" &&
        o.occurredAt > since &&
        !reported.has(String(o.data.runId)),
    )
  )
    return blocked("checks-pending");

  if (latest.result !== "checks-passed") return blocked("checks");

  // The revision the IDE last opened on in this attempt is what the person is working on.
  const opened = own.findLast((o) => o.type === "observation.workspace.opened" && o.issueRevision);
  if (
    !input.published(latest.issueRevision) ||
    (opened && opened.issueRevision !== latest.issueRevision)
  )
    return blocked("revision");

  const pushed = pushedFiles(records, latest.codeArtifactId);
  const saved = pushed && latestSavedCode(records, pushed.participantId, issue);
  if (!pushed || !saved || !saved.complete) return blocked("code-unconfirmed");
  if (Object.entries(pushed.files).some(([path, text]) => saved.files[path] !== text))
    return blocked("code-changed");

  if (input.openRequired > 0) return blocked("review");
  return { blocker: null, latest };
}
