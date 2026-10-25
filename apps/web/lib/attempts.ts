/**
 * Attempts at an issue. Everything up to the first replay is the first attempt; each replay (a
 * board move from Done back to In progress with `trigger: "replay"`, board capture 7.0.0)
 * starts the next one. An attempt is read on its own: the code the IDE restores, the teammate
 * feedback released, which pull request can be merged and the numbers of its result. A first
 * attempt sees exactly the records it always did.
 */
import type { WorkspaceRecord } from "../../../packages/domain/workspace";

export interface Attempt {
  /** 1 for the first attempt, 2 for the first replay, and so on. */
  number: number;
  /** When it began: the replay's time; null for the first attempt. */
  start: string | null;
  /** When the next replay began; null while it is the latest. */
  end: string | null;
}

interface Parsed {
  record: WorkspaceRecord;
  issue: string | null;
  occurredAt: string | null;
  replay: boolean;
}

function parse(records: readonly WorkspaceRecord[]): Parsed[] {
  return records.map((record) => {
    if (record.kind !== "observation")
      return { record, issue: null, occurredAt: null, replay: false };
    try {
      const value = JSON.parse(record.payload);
      return {
        record,
        issue: typeof value?.issue === "string" ? value.issue : null,
        occurredAt:
          typeof value?.occurredAt === "string" ? value.occurredAt : null,
        replay:
          value?.type === "observation.board.moved" &&
          value.data?.trigger === "replay",
      };
    } catch {
      return { record, issue: null, occurredAt: null, replay: false };
    }
  });
}

/** When each replay of the issue began, oldest first. */
export function replayTimes(
  records: readonly WorkspaceRecord[],
  issue: string,
): string[] {
  return parse(records)
    .filter((p) => p.replay && p.issue === issue && p.occurredAt)
    .map((p) => p.occurredAt!)
    .sort();
}

/** Which attempt a moment belongs to, given the replay times: 0 for the first. */
export function attemptIndex(replays: readonly string[], at: string): number {
  return replays.filter((time) => time <= at).length;
}

/** The attempt that was under way at `at`, or the latest one. */
export function attemptAt(
  records: readonly WorkspaceRecord[],
  issue: string,
  at?: string,
): Attempt {
  const replays = replayTimes(records, issue);
  const index = at === undefined ? replays.length : attemptIndex(replays, at);
  return {
    number: index + 1,
    start: replays[index - 1] ?? null,
    end: replays[index] ?? null,
  };
}

/**
 * The records with this issue's observations narrowed to one attempt (the one under way at
 * `at`, or the latest). Other issues' observations and every artifact are kept.
 */
export function attemptRecords(
  records: readonly WorkspaceRecord[],
  issue: string,
  at?: string,
): WorkspaceRecord[] {
  const parsed = parse(records);
  const replays = parsed
    .filter((p) => p.replay && p.issue === issue && p.occurredAt)
    .map((p) => p.occurredAt!)
    .sort();
  if (!replays.length) return [...records];
  const index = at === undefined ? replays.length : attemptIndex(replays, at);
  const start = replays[index - 1];
  const end = replays[index];
  return parsed
    .filter(
      (p) =>
        p.issue !== issue ||
        !p.occurredAt ||
        ((start === undefined || p.occurredAt >= start) &&
          (end === undefined || p.occurredAt < end)),
    )
    .map((p) => p.record);
}
