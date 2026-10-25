/**
 * The incident (docs/incident.md): INC-1, one production incident played from /incident. Its
 * version is the revision it is played on; a shared link names that revision, and an attempt
 * stays on the revision it started on. What an attempt has done (merged a fix whose checks all
 * passed, deployed it) is read only from this browser's records of that attempt, so a page
 * visit, an earlier attempt's merge or an unmerged push never counts.
 */
import { casesRun, type Revision } from "../../../packages/content/model";
import {
  runFeedback,
  type WorkspaceRecord,
} from "../../../packages/domain/workspace";
import { attemptAt, attemptRecords, type Attempt } from "./attempts";

export const INCIDENT = {
  key: "INC-1",
  slug: "checkout-guest-shipping",
} as const;

export function isIncident(key: string | undefined): boolean {
  return key === INCIDENT.key;
}

/** The version people see and share: the first 8 hex digits of the revision's SHA-256. */
export function shortVersion(revision: string): string {
  return revision.replace(/^sha256:/, "").slice(0, 8);
}

/**
 * The revision a version in a link names, among the incident's published revisions: at least
 * 8 hex digits, matching exactly one. Anything else is null, never the latest by default.
 */
export function resolveVersion(
  revisions: readonly string[],
  version: string | null | undefined,
): string | null {
  const wanted = version
    ?.trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
  if (!wanted || !/^[0-9a-f]{8,64}$/.test(wanted)) return null;
  const matches = revisions.filter((id) =>
    id.replace(/^sha256:/, "").startsWith(wanted),
  );
  return matches.length === 1 ? matches[0] : null;
}

interface Observation {
  type: string;
  occurredAt: string;
  sequence: number;
  issueRevision: string | null;
  data: Record<string, unknown>;
}

function observationsOf(
  records: readonly WorkspaceRecord[],
  issue: string,
): Observation[] {
  const out: Observation[] = [];
  for (const record of records) {
    if (record.kind !== "observation") continue;
    try {
      const value = JSON.parse(record.payload);
      if (value?.issue !== issue || typeof value.occurredAt !== "string")
        continue;
      out.push({
        type: String(value.type),
        occurredAt: value.occurredAt,
        sequence: Number(value.source?.sequence ?? 0),
        issueRevision:
          typeof value.issueRevision === "string" ? value.issueRevision : null,
        data: value.data ?? {},
      });
    } catch {
      // An unreadable record is not evidence of anything.
    }
  }
  return out.sort(
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) || a.sequence - b.sequence,
  );
}

export interface Merged {
  number: number;
  runId: string;
  at: string;
  /** The revision the merged push ran against. */
  revision: string;
  passed: number;
  total: number;
}

export interface IncidentState {
  attempt: Attempt;
  /** Something was recorded in this attempt: the start, the IDE, a run. */
  started: boolean;
  /** The revision this attempt is played on: the one its start or replay named. */
  revision: string | null;
  /** This attempt's merged pull request, only if the push it merged passed every check. */
  merged: Merged | null;
  /** The simulated deploy of that pull request, in this attempt. */
  deployed: { at: string; number: number; runId: string } | null;
}

/** Where the latest (or the `at`) attempt at the incident stands, from its own records. */
export function incidentState(
  records: readonly WorkspaceRecord[],
  at?: string,
  issue: string = INCIDENT.slug,
): IncidentState {
  const attempt = attemptAt(records, issue, at);
  const own = observationsOf(attemptRecords(records, issue, at), issue);
  const begin = own.findLast(
    (o) =>
      o.type === "observation.board.moved" &&
      (o.data.trigger === "replay" || o.data.trigger === "start-work"),
  );
  const revision =
    begin?.issueRevision ??
    own.find(
      (o) => o.type.startsWith("observation.workspace.") && o.issueRevision,
    )?.issueRevision ??
    null;

  let merged: Merged | null = null;
  const merge = own.findLast(
    (o) =>
      o.type === "observation.board.moved" &&
      o.data.trigger === "pull-request-merged",
  );
  if (merge) {
    const number = Number(merge.data.pullRequest);
    const runId = String(merge.data.runId);
    // The push that was merged: same pull request and run, recorded in this attempt.
    const push = own.find(
      (o) =>
        o.type === "observation.workspace.pull-request" &&
        Number(o.data.number) === number &&
        String(o.data.runId) === runId,
    );
    if (push && push.data.result === "checks-passed" && push.issueRevision)
      merged = {
        number,
        runId,
        at: merge.occurredAt,
        revision: push.issueRevision,
        passed: Number(push.data.passed),
        total: Number(push.data.total),
      };
  }
  const deploy =
    merged &&
    own.find(
      (o) =>
        o.type === "observation.board.deployed" &&
        Number(o.data.pullRequest) === merged.number &&
        String(o.data.runId) === merged.runId &&
        o.occurredAt >= merged.at,
    );
  return {
    attempt,
    started: own.length > 0,
    revision,
    merged,
    deployed: deploy
      ? { at: deploy.occurredAt, number: merged!.number, runId: merged!.runId }
      : null,
  };
}

export interface Moment {
  label: string;
  at: string;
}

/**
 * The attempt's timeline as recorded: the IDE opened, the log read, the regression reproduced
 * and fixed by a local run, the pull request, the merge and the deploy. Each moment is the
 * first time it happened; a moment that never happened is left out.
 */
export function incidentTimeline(
  records: readonly WorkspaceRecord[],
  revisionFor: (id: string) => Revision | undefined,
  at?: string,
  issue: string = INCIDENT.slug,
): Moment[] {
  const own = observationsOf(attemptRecords(records, issue, at), issue);
  const out: Moment[] = [];
  const first = (label: string, test: (o: Observation) => boolean) => {
    const found = own.find(test);
    if (found) out.push({ label, at: found.occurredAt });
  };
  first(
    "Acknowledged the page",
    (o) =>
      o.type === "observation.board.moved" &&
      (o.data.trigger === "start-work" || o.data.trigger === "replay"),
  );
  first("Opened the IDE", (o) => o.type === "observation.workspace.opened");
  first(
    "Read the logs",
    (o) =>
      o.type === "observation.workspace.navigated" &&
      o.data.target === "file" &&
      o.data.via !== "app" &&
      String(o.data.value).startsWith("logs/"),
  );
  // Local runs that reached the cases, with which visible cases passed.
  const runs = own.flatMap((o) => {
    if (
      o.type !== "observation.workspace.run" ||
      o.data.purpose === "pull-request"
    )
      return [];
    const revision = o.issueRevision ? revisionFor(o.issueRevision) : undefined;
    const outcome = o.data.outcome as
      | {
          phase?: string;
          cases?: { output?: { text: string; truncated: boolean } }[];
        }
      | undefined;
    if (!revision || outcome?.phase !== "tests" || !outcome.cases) return [];
    const cases = casesRun(revision.checks.cases, "local");
    const { passed } = runFeedback(cases, outcome.cases);
    return [
      {
        at: o.occurredAt,
        passed,
        all: passed.length > 0 && passed.every(Boolean),
      },
    ];
  });
  const failing = runs.find((r) => !r.all);
  if (failing)
    out.push({ label: "Reproduced it with the tests", at: failing.at });
  const green = runs.find((r) => r.all);
  if (green) out.push({ label: "Tests green locally", at: green.at });
  first(
    "Opened the pull request",
    (o) => o.type === "observation.workspace.pull-request",
  );
  first(
    "Merged the fix",
    (o) =>
      o.type === "observation.board.moved" &&
      o.data.trigger === "pull-request-merged",
  );
  first(
    "Deployed to production",
    (o) => o.type === "observation.board.deployed",
  );
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** "+4:05" from the first moment. */
export function sinceStart(start: string, at: string): string {
  const seconds = Math.max(
    0,
    Math.round((Date.parse(at) - Date.parse(start)) / 1000),
  );
  const minutes = Math.floor(seconds / 60);
  return `+${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "First response" for the first attempt, then "Replay 1", "Replay 2". */
export function attemptLabel(attempt: number): string {
  return attempt === 1 ? "First response" : `Replay ${attempt - 1}`;
}
