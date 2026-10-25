/**
 * The dashboard's view of recorded activity: what happened recently, and how busy each day
 * was. Built from the observations this browser stores; nothing here is uploaded.
 */
import type { WorkspaceRecord } from "../../../packages/domain/workspace";

interface Observation {
  type?: string;
  participantId?: string;
  occurredAt?: string;
  issue?: string;
  data?: Record<string, unknown>;
}

function observations(records: readonly WorkspaceRecord[]): Observation[] {
  return records.flatMap((record) => {
    if (record.kind !== "observation") return [];
    try {
      const value = JSON.parse(record.payload) as Observation;
      return value && typeof value.occurredAt === "string" ? [value] : [];
    } catch {
      return [];
    }
  });
}

export interface PullRequestRecord {
  number: number;
  /** How many times it has been checked: opened, then each push. */
  pushes: number;
  runId: string;
  revision: number;
  result: string;
  passed: number;
  total: number;
  at: string;
}

/**
 * This person's pull requests for an issue (any revision), newest first, each as of its
 * latest push.
 */
export function pullRequestHistory(
  records: readonly WorkspaceRecord[],
  participantId: string,
  issueId: string,
): PullRequestRecord[] {
  const checked = observations(records)
    .filter(
      (o) =>
        o.type === "observation.workspace.pull-request" &&
        o.participantId === participantId &&
        o.issue === issueId &&
        o.data,
    )
    .map((o) => ({
      number: Number(o.data!.number),
      pushes: 1,
      runId: String(o.data!.runId),
      revision: Number(o.data!.revision),
      result: String(o.data!.result),
      passed: Number(o.data!.passed),
      total: Number(o.data!.total),
      at: o.occurredAt!,
    }))
    .sort((a, b) => b.number - a.number || b.at.localeCompare(a.at));
  const latest = new Map<number, PullRequestRecord>();
  for (const pull of checked) {
    const seen = latest.get(pull.number);
    if (seen) seen.pushes += 1;
    else latest.set(pull.number, pull);
  }
  return [...latest.values()];
}

export interface HeatDay {
  day: string;
  count: number;
  /** 0 for nothing, then 1–4 by volume, like GitHub's contribution graph. */
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
}

function level(count: number): HeatDay["level"] {
  if (count === 0) return 0;
  if (count < 3) return 1;
  if (count < 10) return 2;
  if (count < 30) return 3;
  return 4;
}
