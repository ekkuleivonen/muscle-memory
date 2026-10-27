/**
 * How far the roster is covered: for each target (a model at a reasoning effort) and harness
 * version, how many live challenge revisions have all their tries finished, and how many runs
 * are still to do. Runs on revisions no longer live don't count: a challenge's new revision is
 * new work. Pure, from the ledger's counts (`coverage` in ./ledger.ts).
 */
import type { Coverage, Target } from "./ledger";

export interface TargetCoverage {
  readonly model: string;
  readonly effort: string;
  readonly harnessVersion: string;
  /** Whether this is the current harness: the one Go works towards. */
  readonly current: boolean;
  readonly onRoster: boolean;
  /** Live revisions. */
  readonly live: number;
  /** Live revisions with every try finished. */
  readonly covered: number;
  /** Live revisions with at least one finished run. */
  readonly started: number;
  /** Finished runs on live revisions, and how many completed. */
  readonly finished: number;
  readonly completed: number;
  /** Queued, running, or waiting to retry after a harness failure. */
  readonly waiting: number;
  readonly harnessFailures: number;
  /** Runs still to do for full coverage. */
  readonly todo: number;
}

/** The effort a stored condition names. */
export function effortOf(condition: string): string {
  try {
    return String(JSON.parse(condition).reasoning ?? "default");
  } catch {
    return condition;
  }
}

export function summarize(
  rows: readonly Coverage[],
  roster: readonly Target[],
  liveRevisions: readonly string[],
  harnessVersion: string,
  tries: number,
): TargetCoverage[] {
  const live = new Set(liveRevisions);
  const series = new Map<string, { model: string; effort: string; harness: string; rows: Coverage[] }>();
  const key = (model: string, effort: string, harness: string) => JSON.stringify([model, effort, harness]);
  for (const target of roster)
    series.set(key(target.model, target.effort, harnessVersion), {
      model: target.model,
      effort: target.effort,
      harness: harnessVersion,
      rows: [],
    });
  for (const row of rows) {
    const effort = effortOf(row.condition);
    const k = key(row.model, effort, row.harness_version);
    if (!series.has(k)) series.set(k, { model: row.model, effort, harness: row.harness_version, rows: [] });
    series.get(k)!.rows.push(row);
  }
  return [...series.values()]
    .map(({ model, effort, harness, rows }) => {
      const onLive = rows.filter((r) => live.has(r.revision));
      const finishedBy = new Map<string, number>();
      for (const r of onLive)
        if (r.status === "finished") finishedBy.set(r.revision, (finishedBy.get(r.revision) ?? 0) + r.runs);
      const sum = (match: (r: Coverage) => boolean) => onLive.filter(match).reduce((n, r) => n + r.runs, 0);
      const finished = sum((r) => r.status === "finished");
      const onRoster = roster.some((t) => t.model === model && t.effort === effort);
      return {
        model,
        effort,
        harnessVersion: harness,
        current: harness === harnessVersion,
        onRoster,
        live: live.size,
        covered: [...finishedBy.values()].filter((n) => n >= tries).length,
        started: finishedBy.size,
        finished,
        completed: sum((r) => r.outcome === "completed"),
        waiting: sum((r) => r.status !== "finished"),
        harnessFailures: sum((r) => r.status === "harness-failed"),
        todo:
          onRoster && harness === harnessVersion
            ? [...live].reduce((n, revision) => n + Math.max(0, tries - (finishedBy.get(revision) ?? 0)), 0)
            : 0,
      };
    })
    .sort(
      (a, b) =>
        a.model.localeCompare(b.model) ||
        Number(b.current) - Number(a.current) ||
        b.harnessVersion.localeCompare(a.harnessVersion) ||
        EFFORT_ORDER.indexOf(a.effort) - EFFORT_ORDER.indexOf(b.effort),
    );
}

const EFFORT_ORDER = ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"];
