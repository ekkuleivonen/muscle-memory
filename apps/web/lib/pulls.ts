/**
 * Pull requests as the record of an attempt, read from the observations this browser stores:
 * the code that was submitted, the run that checked it, and what happened in the IDE
 * between the previous pull request and this one. Raw facts only; nothing here grades.
 *
 * A pull request stays open, whatever its checks say, until the person merges it (recorded as
 * the board move to Done) or closes it without merging (`observation.board.closed`). Work continues on an open one: each push is recorded under the same
 * number, and the pull request shows its latest push.
 */
import { casesRun, type Revision } from "../../../packages/content/model";
import type { Json } from "../../../packages/domain/json";
import {
  pullRequestResult,
  type WorkspaceRecord,
} from "../../../packages/domain/workspace";

export interface PullSummary {
  /** The issue's permanent id. */
  issue: string;
  /** The issue revision its latest push ran against. */
  issueRevision: string;
  number: number;
  runId: string;
  /** The editor's document revision that was pushed. */
  codeRevision: number;
  codeArtifactId: string;
  result: string;
  passed: number;
  total: number;
  /** When its latest push's checks finished. */
  at: string;
  /** When its first checks finished. */
  openedAt: string;
  /** Opened, then each push: how many times CI checked it. */
  pushes: number;
  state: "open" | "merged" | "closed";
  /** When the person merged it. */
  mergedAt?: string;
  /** When the person closed it without merging. */
  closedAt?: string;
  /** Another of this issue's pull requests that was merged, which put the issue in Done. */
  otherMerged?: number;
}

interface Observation {
  type: string;
  occurredAt: string;
  sequence: number;
  issue: string | null;
  issueRevision: string | null;
  data: Record<string, unknown>;
}

function observations(records: readonly WorkspaceRecord[]): Observation[] {
  return records
    .flatMap((record): Observation[] => {
      if (record.kind !== "observation") return [];
      try {
        const value = JSON.parse(record.payload);
        if (typeof value?.occurredAt !== "string") return [];
        return [
          {
            type: String(value.type),
            occurredAt: value.occurredAt,
            sequence: Number(value.source?.sequence ?? 0),
            issue: typeof value.issue === "string" ? value.issue : null,
            issueRevision:
              typeof value.issueRevision === "string"
                ? value.issueRevision
                : null,
            data: value.data ?? {},
          },
        ];
      } catch {
        return [];
      }
    })
    .sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) || a.sequence - b.sequence,
    );
}

/** Merge times by issue and pull request number: "frequency-map#2" → time. */
function merges(all: readonly Observation[]): Map<string, string> {
  const merged = new Map<string, string>();
  for (const o of all)
    if (
      o.type === "observation.board.moved" &&
      o.data.trigger === "pull-request-merged" &&
      o.issue
    ) {
      const key = `${o.issue}#${Number(o.data.pullRequest)}`;
      if (!merged.has(key)) merged.set(key, o.occurredAt);
    }
  return merged;
}

/** Close times by issue and pull request number, like merges. */
function closes(all: readonly Observation[]): Map<string, string> {
  const closed = new Map<string, string>();
  for (const o of all)
    if (o.type === "observation.board.closed" && o.issue) {
      const key = `${o.issue}#${Number(o.data.pullRequest)}`;
      if (!closed.has(key)) closed.set(key, o.occurredAt);
    }
  return closed;
}

/** How pull requests ended: merged or closed, by "issue#number". */
interface Ends {
  merged: Map<string, string>;
  closed: Map<string, string>;
}

const ends = (all: readonly Observation[]): Ends => ({
  merged: merges(all),
  closed: closes(all),
});

/** Numbers of this issue's pull requests closed without merging. */
export function closedPullRequests(
  records: readonly WorkspaceRecord[],
  issue: string,
): Set<number> {
  const numbers = new Set<number>();
  for (const key of closes(observations(records)).keys()) {
    const [id, number] = key.split("#");
    if (id === issue) numbers.add(Number(number));
  }
  return numbers;
}

/** Numbers of this issue's merged pull requests. */
export function mergedPullRequests(
  records: readonly WorkspaceRecord[],
  issue: string,
): Set<number> {
  const numbers = new Set<number>();
  for (const key of merges(observations(records)).keys()) {
    const [id, number] = key.split("#");
    if (id === issue) numbers.add(Number(number));
  }
  return numbers;
}

/** A pull request as of its latest push; `pushes` are its observations, oldest first. */
function summary(
  pushes: readonly Observation[],
  { merged, closed }: Ends,
): PullSummary {
  const o = pushes[pushes.length - 1];
  const mergedAt = merged.get(`${o.issue}#${Number(o.data.number)}`);
  // Merging wins: a merged pull request was never closed unmerged.
  const closedAt = mergedAt
    ? undefined
    : closed.get(`${o.issue}#${Number(o.data.number)}`);
  const other = [...merged.keys()]
    .map((key) => key.split("#"))
    .find(
      ([id, n]) => id === o.issue && Number(n) !== Number(o.data.number),
    )?.[1];
  return {
    issue: o.issue!,
    issueRevision: o.issueRevision!,
    number: Number(o.data.number),
    runId: String(o.data.runId),
    codeRevision: Number(o.data.revision),
    codeArtifactId: String(o.data.codeArtifactId),
    result: String(o.data.result),
    passed: Number(o.data.passed),
    total: Number(o.data.total),
    at: o.occurredAt,
    openedAt: pushes[0].occurredAt,
    pushes: pushes.length,
    state: mergedAt ? "merged" : closedAt ? "closed" : "open",
    ...(mergedAt ? { mergedAt } : {}),
    ...(closedAt ? { closedAt } : {}),
    ...(other ? { otherMerged: Number(other) } : {}),
  };
}

/** Pull request observations grouped by issue and number, each group oldest first. */
function grouped(all: readonly Observation[]): Observation[][] {
  const groups = new Map<string, Observation[]>();
  for (const o of all)
    if (o.type === "observation.workspace.pull-request" && o.issue) {
      const key = `${o.issue}#${Number(o.data.number)}`;
      groups.set(key, [...(groups.get(key) ?? []), o]);
    }
  return [...groups.values()];
}

/** Every pull request recorded in this browser, newest first. */
export function allPullRequests(
  records: readonly WorkspaceRecord[],
): PullSummary[] {
  const all = observations(records);
  const merged = ends(all);
  return grouped(all)
    .map((pushes) => summary(pushes, merged))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export type TimelineEntry =
  /** Opened in the IDE; `times` when it was opened again with nothing done in between. */
  | { kind: "opened"; at: string; times: number }
  | { kind: "edits"; at: string; from: string; count: number }
  | {
      kind: "run";
      at: string;
      status: string;
      passed: number;
      total: number;
      /** Reached the cases: a compile or runtime error, timeout or runner failure did not. */
      tested: boolean;
    }
  | { kind: "pull-request"; at: string; number: number }
  | { kind: "push"; at: string; number: number; push: number }
  | {
      kind: "checks";
      at: string;
      result: string;
      passed: number;
      total: number;
    }
  | { kind: "merged"; at: string }
  | { kind: "closed"; at: string }
  /** A teammate's review comment on this pull request; its thread is read from feedback. */
  | { kind: "review"; at: string; comment: string; push: number }
  | {
      kind: "resolved";
      at: string;
      comment: string;
      push: number;
      issueRevision: string;
    }
  /** A comment or hint released into the ticket's thread while this work went on. */
  | {
      kind: "note";
      at: string;
      source: "comment" | "hint";
      id: string;
      wording: number;
      issueRevision: string;
    };

export interface PullDetail {
  pull: PullSummary;
  /** The pull request before this one for the same issue, if any. */
  previous?: PullSummary;
  /** Every editable file as pushed, by path; null when the code was not saved. */
  code: Record<string, { text: string; truncated: boolean }> | null;
  /** The checks run's raw outcome, as recorded. */
  outcome: Json | null;
  openedAt: string;
  timeline: TimelineEntry[];
  stats: {
    /** First recorded activity since the previous pull request. */
    startedAt: string;
    edits: number;
    runs: number;
    /** First local run in which every case passed. */
    firstGreenAt?: string;
  };
}

const TERMINAL = new Set([
  "result",
  "user-error",
  "runner-error",
  "timeout",
  "cancelled",
]);

/**
 * One pull request with the work that led to it: everything recorded for its issue after
 * the previous pull request, up to and including its latest push's checks. Edits are counted,
 * not listed.
 */
export function pullRequestDetail(
  records: readonly WorkspaceRecord[],
  issue: string,
  number: number,
  revisionFor: (id: string) => Revision | undefined,
): PullDetail | null {
  const all = observations(records).filter((o) => o.issue === issue);
  const merged = ends(all);
  const groups = grouped(all);
  const own = groups.find((g) => Number(g[0].data.number) === number);
  if (!own) return null;
  const pull = summary(own, merged);
  const before = groups
    .filter((g) => Number(g[0].data.number) < number)
    .map((g) => summary(g, merged))
    .sort((a, b) => b.number - a.number)[0];
  // Its pushes' runs, and which push each one was.
  const pushOf = new Map(
    own.map((o, index) => [String(o.data.runId), index + 1]),
  );
  // Work since the previous pull request's last checks, through this one's latest checks.
  const window = all.filter(
    (o) =>
      (!before || o.occurredAt > before.at) &&
      (o.occurredAt <= pull.at ||
        (o.type === "observation.workspace.run" &&
          pushOf.has(String(o.data.runId)))) &&
      // Another pull request's own runs and checks are its story, not this one's.
      !(
        (o.type === "observation.workspace.pull-request" &&
          Number(o.data.number) !== number) ||
        (o.type === "observation.workspace.run" &&
          o.data.purpose === "pull-request" &&
          !pushOf.has(String(o.data.runId)))
      ),
  );

  const timeline: TimelineEntry[] = [];
  let edits = 0;
  let runs = 0;
  let firstGreenAt: string | undefined;
  let outcome: Json | null = null;
  let openedAt = pull.openedAt;
  const started = new Set<number>();
  // Consecutive edits fold into one entry, closed by the next thing that happens.
  const edit: { pending: Extract<TimelineEntry, { kind: "edits" }> | null } = {
    pending: null,
  };
  const flush = () => {
    if (edit.pending) timeline.push(edit.pending);
    edit.pending = null;
  };
  for (const o of window) {
    if (o.type === "observation.workspace.edit") {
      edits++;
      if (edit.pending) {
        edit.pending.count++;
        edit.pending.at = o.occurredAt;
      } else
        edit.pending = {
          kind: "edits",
          at: o.occurredAt,
          from: o.occurredAt,
          count: 1,
        };
      continue;
    }
    if (o.type === "observation.workspace.opened") {
      flush();
      const last = timeline.at(-1);
      if (last?.kind === "opened") last.times++;
      else timeline.push({ kind: "opened", at: o.occurredAt, times: 1 });
    } else if (o.type === "observation.workspace.run") {
      const status = String(o.data.status);
      const revision = o.issueRevision
        ? revisionFor(o.issueRevision)
        : undefined;
      const push = pushOf.get(String(o.data.runId));
      if (push) {
        // The first observation of a push's run is when it was opened or pushed.
        if (!started.has(push)) {
          started.add(push);
          flush();
          if (push === 1) openedAt = o.occurredAt;
          timeline.push(
            push === 1
              ? { kind: "pull-request", at: o.occurredAt, number }
              : { kind: "push", at: o.occurredAt, number, push },
          );
        }
        if (o.data.runId === pull.runId && TERMINAL.has(status))
          outcome = (o.data.outcome as Json) ?? null;
      } else if (o.data.purpose !== "pull-request" && TERMINAL.has(status)) {
        flush();
        runs++;
        const verdict = revision
          ? pullRequestResult(
              casesRun(revision.checks.cases, "local"),
              o.data.outcome as never,
            )
          : { result: "checks-errored", passed: 0, total: 0 };
        const green = verdict.result === "checks-passed";
        const tested = green || verdict.result === "checks-failed";
        if (green && !firstGreenAt) firstGreenAt = o.occurredAt;
        timeline.push({
          kind: "run",
          at: o.occurredAt,
          status,
          passed: verdict.passed,
          total: verdict.total,
          tested,
        });
      }
    } else if (o.type === "observation.workspace.pull-request") {
      // This pull request's checks for one push.
      const push = pushOf.get(String(o.data.runId)) ?? 1;
      if (!started.has(push)) {
        started.add(push);
        flush();
        timeline.push(
          push === 1
            ? { kind: "pull-request", at: o.occurredAt, number }
            : { kind: "push", at: o.occurredAt, number, push },
        );
      }
      flush();
      timeline.push({
        kind: "checks",
        at: o.occurredAt,
        result: String(o.data.result),
        passed: Number(o.data.passed),
        total: Number(o.data.total),
      });
    }
  }
  flush();
  // Teammate feedback: this pull request's review, whenever it came (it follows the checks),
  // and the ticket's comments and hints released during the work above.
  for (const o of all) {
    const d = o.data;
    if (
      o.type === "observation.workspace.comment" &&
      d.where === "review" &&
      Number(d.pullRequest) === number
    )
      timeline.push({
        kind: "review",
        at: o.occurredAt,
        comment: String(d.comment),
        push: Number(d.push),
      });
    else if (
      o.type === "observation.workspace.thread-resolved" &&
      Number(d.pullRequest) === number
    )
      timeline.push({
        kind: "resolved",
        at: o.occurredAt,
        comment: String(d.comment),
        push: Number(d.push),
        issueRevision: o.issueRevision ?? "",
      });
    else if (
      (o.type === "observation.workspace.hint" ||
        (o.type === "observation.workspace.comment" && d.where === "issue")) &&
      window.includes(o)
    )
      timeline.push({
        kind: "note",
        at: o.occurredAt,
        source: o.type === "observation.workspace.hint" ? "hint" : "comment",
        id: String(
          o.type === "observation.workspace.hint" ? d.hint : d.comment,
        ),
        wording: Number(d.wording ?? 0),
        issueRevision: o.issueRevision ?? "",
      });
  }
  if (pull.mergedAt) timeline.push({ kind: "merged", at: pull.mergedAt });
  if (pull.closedAt) timeline.push({ kind: "closed", at: pull.closedAt });
  // In time order; entries at the same moment keep the order they were added in.
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  const artifact = records.find(
    (r) => r.kind === "artifact" && r.recordId === pull.codeArtifactId,
  );
  let code: PullDetail["code"] = null;
  if (artifact)
    try {
      const value = JSON.parse(artifact.payload);
      code = Object.fromEntries(
        Object.entries(
          (value.files ?? {}) as Record<
            string,
            { text?: string; capture?: { truncated?: boolean } }
          >,
        ).map(([path, file]) => [
          path,
          {
            text: String(file.text ?? ""),
            truncated: Boolean(file.capture?.truncated),
          },
        ]),
      );
    } catch {
      code = null;
    }

  return {
    pull,
    previous: before,
    code,
    outcome,
    openedAt,
    timeline,
    stats: {
      startedAt: window[0]?.occurredAt ?? openedAt,
      edits,
      runs,
      firstGreenAt,
    },
  };
}

/** "1h 12m", "4m", "under a minute". */
export function duration(from: string, to: string): string {
  const minutes = Math.round((Date.parse(to) - Date.parse(from)) / 60000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
