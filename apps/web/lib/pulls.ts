/**
 * Pull requests as the record of an attempt, read from the observations this browser stores:
 * the code that was submitted, the run that checked it, and what happened in the IDE
 * between the previous pull request and this one. Raw facts only; nothing here grades.
 *
 * A pull request stays open, whatever its checks say, until the person merges it (recorded as
 * the board move to Done) or closes it without merging (`observation.board.closed`). Work continues on an open one: each push is recorded under the same
 * number, and the pull request shows its latest push.
 */
import { attemptIndex } from "./attempts";
import { type WorkspaceRecord } from "../../../packages/domain/workspace";

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
  /**
   * Another of this issue's pull requests merged in the same attempt, which put the issue in
   * Done. A replay starts a new attempt (./attempts), whose pull requests can be merged again.
   */
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

/** Replay times by issue, oldest first: each starts a new attempt. */
function replays(all: readonly Observation[]): Map<string, string[]> {
  const times = new Map<string, string[]>();
  for (const o of all)
    if (
      o.type === "observation.board.moved" &&
      o.data.trigger === "replay" &&
      o.issue
    )
      times.set(o.issue, [...(times.get(o.issue) ?? []), o.occurredAt]);
  return times;
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
  /** Replay times by issue: each starts a new attempt. */
  replayed: Map<string, string[]>;
}

const ends = (all: readonly Observation[]): Ends => ({
  merged: merges(all),
  closed: closes(all),
  replayed: replays(all),
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
  { merged, closed, replayed }: Ends,
): PullSummary {
  const o = pushes[pushes.length - 1];
  const mergedAt = merged.get(`${o.issue}#${Number(o.data.number)}`);
  // Merging wins: a merged pull request was never closed unmerged.
  const closedAt = mergedAt
    ? undefined
    : closed.get(`${o.issue}#${Number(o.data.number)}`);
  const times = replayed.get(o.issue!) ?? [];
  const attempt = attemptIndex(times, pushes[0].occurredAt);
  const other = [...merged.entries()]
    .map(([key, at]) => [...key.split("#"), at])
    .find(
      ([id, n, at]) =>
        id === o.issue &&
        Number(n) !== Number(o.data.number) &&
        attemptIndex(times, at) === attempt,
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

const TERMINAL = new Set([
  "result",
  "user-error",
  "runner-error",
  "timeout",
  "cancelled",
]);

/** "1h 12m", "4m", "under a minute". */
export function duration(from: string, to: string): string {
  const minutes = Math.round((Date.parse(to) - Date.parse(from)) / 60000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
