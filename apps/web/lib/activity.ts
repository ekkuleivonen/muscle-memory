/**
 * The dashboard's view of recorded activity: what happened recently, and how busy each day
 * was. Built from the observations this browser stores; nothing here is uploaded.
 */
import type { WorkspaceRecord } from "../../../packages/domain/workspace";

export type ActivityEntry =
  | { kind: "moved"; at: string; key: string; from: string; to: string }
  | { kind: "opened"; at: string; challengeId: string }
  | { kind: "ran"; at: string; challengeId: string; status: string };

interface Observation {
  type?: string;
  occurredAt?: string;
  challengeArtifactId?: string;
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

/** "challenge.frequency-map.2.1.0" → "frequency-map". */
export function challengeIdOf(artifactId: string | undefined): string | null {
  return /^challenge\.([^.]+)\./.exec(artifactId ?? "")?.[1] ?? null;
}

/** Things worth a line in a feed, newest first. Edits and snapshots only count as activity. */
export function recentActivity(
  records: readonly WorkspaceRecord[],
  limit = 8,
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const o of observations(records)) {
    const at = o.occurredAt!;
    const challengeId = challengeIdOf(o.challengeArtifactId);
    if (o.type === "observation.board.moved" && o.data)
      entries.push({
        kind: "moved",
        at,
        key: String(o.data.issueKey),
        from: String(o.data.from),
        to: String(o.data.to),
      });
    else if (o.type === "observation.workspace.opened" && challengeId)
      entries.push({ kind: "opened", at, challengeId });
    else if (
      o.type === "observation.workspace.run" &&
      challengeId &&
      o.data &&
      o.data.status !== "started"
    )
      entries.push({
        kind: "ran",
        at,
        challengeId,
        status: String(o.data.status),
      });
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** Local calendar day, so a late-night session counts where the person was. */
export function dayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Recorded actions per local day. */
export function actionsPerDay(
  records: readonly WorkspaceRecord[],
): Map<string, number> {
  const days = new Map<string, number>();
  for (const o of observations(records)) {
    const day = dayOf(new Date(o.occurredAt!));
    days.set(day, (days.get(day) ?? 0) + 1);
  }
  return days;
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

/**
 * Weeks as columns of seven days, Monday first, ending with the week that holds `today`.
 * Days after today are marked so the grid can leave them blank.
 */
export function heatmap(
  counts: ReadonlyMap<string, number>,
  today: Date,
  weeks = 15,
): HeatDay[][] {
  const start = new Date(today);
  start.setHours(12, 0, 0, 0);
  const sinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - sinceMonday - (weeks - 1) * 7);
  const todayKey = dayOf(today);
  const columns: HeatDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: HeatDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const day = dayOf(date);
      const count = counts.get(day) ?? 0;
      column.push({ day, count, level: level(count), future: day > todayKey });
    }
    columns.push(column);
  }
  return columns;
}

/** Days with any activity in the last `days` days, today included. */
export function activeDays(
  counts: ReadonlyMap<string, number>,
  today: Date,
  days = 30,
): number {
  let active = 0;
  const date = new Date(today);
  date.setHours(12, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    if ((counts.get(dayOf(date)) ?? 0) > 0) active += 1;
    date.setDate(date.getDate() - 1);
  }
  return active;
}

export function timeAgo(at: string, now: Date): string {
  const seconds = Math.max(0, (now.getTime() - Date.parse(at)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
