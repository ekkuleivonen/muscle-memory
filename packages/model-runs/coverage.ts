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
  /** USD reported by finished runs on live revisions, and how many reported a cost. */
  readonly spent: number;
  readonly priced: number;
  /**
   * Average cost and seconds per finished run: this level's own, or the model's other levels'
   * (then `estimatedFrom` is `model`), or null before the model has run at all.
   */
  readonly costPerRun: number | null;
  readonly secondsPerRun: number | null;
  readonly estimatedFrom: "level" | "model" | null;
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
      const finishedRows = onLive.filter((r) => r.status === "finished");
      const spent = finishedRows.reduce((n, r) => n + (r.cost ?? 0), 0);
      const priced = finishedRows.reduce((n, r) => n + (r.priced ?? 0), 0);
      const seconds = finishedRows.reduce((n, r) => n + (r.seconds ?? 0), 0);
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
        spent,
        priced,
        seconds,
      };
    })
    .map((row, _, all) => {
      // A level that hasn't run yet is estimated from the model's other levels, all versions.
      const own = row.priced > 0;
      const model = all.filter((r) => r.model === row.model);
      const modelPriced = model.reduce((n, r) => n + r.priced, 0);
      const modelFinished = model.reduce((n, r) => n + r.finished, 0);
      const { seconds, ...rest } = row;
      return {
        ...rest,
        costPerRun: own
          ? row.spent / row.priced
          : modelPriced
            ? model.reduce((n, r) => n + r.spent, 0) / modelPriced
            : null,
        secondsPerRun:
          row.finished > 0
            ? seconds / row.finished
            : modelFinished
              ? model.reduce((n, r) => n + r.seconds, 0) / modelFinished
              : null,
        estimatedFrom: own ? ("level" as const) : modelPriced || modelFinished ? ("model" as const) : null,
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

export interface Estimate {
  /** USD still to spend, over the runs that can be estimated. */
  readonly cost: number;
  /** Seconds of run time still to go, one run at a time. */
  readonly seconds: number;
  /** Runs to do with no estimate yet: their model hasn't run. */
  readonly unknown: number;
}

/** What the rows still to do will cost and take, from each row's averages. */
export function estimate(rows: readonly TargetCoverage[]): Estimate {
  return rows.reduce(
    (sum, r) => ({
      cost: sum.cost + (r.costPerRun ?? 0) * r.todo,
      seconds: sum.seconds + (r.secondsPerRun ?? 0) * r.todo,
      unknown: sum.unknown + (r.costPerRun === null || r.secondsPerRun === null ? r.todo : 0),
    }),
    { cost: 0, seconds: 0, unknown: 0 },
  );
}
