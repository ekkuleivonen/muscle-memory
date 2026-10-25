/**
 * A completed challenge's numbers (metrics version 2), measured from this browser's own records
 * (keystrokes, edits, runs, the page) and recorded with the completion as `board.result`. No
 * score and no rank of anyone. Shared cards are lib/outcome.ts.
 */
import type { Revision } from "../../../packages/content/model";
import { casesRun } from "../../../packages/content/model";
import {
  runFeedback,
  type WorkspaceRecord,
} from "../../../packages/domain/workspace";

/** Version 2 of the card's numbers; the meaning of each is in `metricsOf`. */
export interface Metrics {
  /** Active time in seconds: gaps between activity, each counted up to a minute. */
  readonly t: number;
  /** Seconds from first opening the issue to the first edit. */
  readonly rd: number;
  /** Keys pressed in the editors, modifier keys alone not counted. */
  readonly ks: number;
  /** Typos fixed, estimated: runs of Backspace or Delete within two seconds of typing. */
  readonly ty: number;
  /** Peak typing speed in words per minute: the most characters in any ten seconds, ÷ 5. */
  readonly w: number;
  /** Test runs (Run tests). */
  readonly r: number;
  /** The run that first passed every case (1 = green on the first try); 0 if none did. */
  readonly g: number;
  /** Pushes to pull requests, opening included. */
  readonly p: number;
  /** Hints received. */
  readonly h: number;
  /** Pastes into the editor. */
  readonly ps: number;
  /** Times the page was hidden (another tab or app) while working. */
  readonly lt: number;
}

const ACTIVE = new Set([
  "observation.workspace.edit",
  "observation.workspace.keys",
  "observation.workspace.selection",
  "observation.workspace.scroll",
  "observation.workspace.clipboard",
  "observation.workspace.run",
  "observation.workspace.navigated",
]);
const TERMINAL = new Set([
  "result",
  "user-error",
  "runner-error",
  "timeout",
  "cancelled",
]);
const MODIFIERS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "AltGraph",
  "Fn",
]);
const DELETES = new Set(["Backspace", "Delete"]);

interface Observation {
  type: string;
  occurredAt: string;
  issueRevision?: string;
  source?: { id: string; sequence: number };
  data: Record<string, unknown>;
}

/**
 * The card's numbers for one issue, from everything recorded for it up to `until` (the
 * merge). `revisionFor` scores local runs against the cases they ran.
 */
export function metricsOf(
  records: readonly WorkspaceRecord[],
  issue: string,
  until: string,
  revisionFor: (id: string) => Revision | undefined,
): Metrics {
  const observations: Observation[] = [];
  for (const record of records) {
    if (record.kind !== "observation") continue;
    try {
      const o = JSON.parse(record.payload);
      if (
        o.issue === issue &&
        typeof o.occurredAt === "string" &&
        o.occurredAt <= until
      )
        observations.push({ ...o, data: o.data ?? {} });
    } catch {
      // Unreadable records say nothing.
    }
  }
  observations.sort(
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) ||
      (a.source?.sequence ?? 0) - (b.source?.sequence ?? 0),
  );

  // Active time: each gap between activity counts up to a minute, so breaks do not.
  let active = 0;
  let previous: number | null = null;
  for (const o of observations) {
    if (!ACTIVE.has(o.type)) continue;
    const at = Date.parse(o.occurredAt);
    if (previous !== null) active += Math.min(at - previous, 60_000);
    previous = at;
  }

  const opened = observations.find(
    (o) => o.type === "observation.workspace.opened",
  );
  const edited = observations.find(
    (o) => o.type === "observation.workspace.edit",
  );
  const read =
    opened && edited
      ? Math.max(
          0,
          Date.parse(edited.occurredAt) - Date.parse(opened.occurredAt),
        )
      : 0;

  // Keys, per source (one page load), in the order they were pressed.
  const bySource = new Map<string, [number, string][]>();
  for (const o of observations)
    if (o.type === "observation.workspace.keys") {
      const keys =
        (o.data.keys as [number, string, string, string, boolean][]) ?? [];
      const list = bySource.get(o.source?.id ?? "") ?? [];
      for (const [t, kind, key] of keys)
        if (kind === "down") list.push([t, key]);
      bySource.set(o.source?.id ?? "", list);
    }
  let keystrokes = 0;
  let typos = 0;
  let peak = 0;
  for (const keys of bySource.values()) {
    keys.sort((a, b) => a[0] - b[0]);
    let lastTyped = -Infinity;
    let deleting = false;
    const typed: number[] = [];
    for (const [t, key] of keys) {
      if (MODIFIERS.has(key)) continue;
      keystrokes++;
      if (DELETES.has(key)) {
        // A run of deletes right after typing is one typo being fixed.
        if (!deleting && t - lastTyped <= 2000) typos++;
        deleting = true;
      } else {
        deleting = false;
        if (key.length === 1) {
          lastTyped = t;
          typed.push(t);
        }
      }
    }
    // The most characters typed in any ten seconds.
    let start = 0;
    for (let end = 0; end < typed.length; end++) {
      while (typed[end] - typed[start] > 10_000) start++;
      const count = end - start + 1;
      if (count >= 15) peak = Math.max(peak, Math.round((count / 5) * 6));
    }
  }

  let runs = 0;
  let green = 0;
  let pushes = 0;
  let hints = 0;
  let pastes = 0;
  let left = 0;
  for (const o of observations) {
    if (
      o.type === "observation.workspace.run" &&
      o.data.purpose !== "pull-request" &&
      TERMINAL.has(String(o.data.status))
    ) {
      runs++;
      const revision = o.issueRevision
        ? revisionFor(o.issueRevision)
        : undefined;
      const outcome = o.data.outcome as
        | {
            phase?: string;
            cases?: { output?: { text: string; truncated: boolean } }[];
          }
        | undefined;
      if (!green && revision && outcome?.phase === "tests" && outcome.cases) {
        const { correct, total } = runFeedback(
          casesRun(revision.checks.cases, "local"),
          outcome.cases,
        );
        if (total > 0 && correct === total) green = runs;
      }
    }
    if (o.type === "observation.workspace.pull-request") pushes++;
    if (o.type === "observation.workspace.hint") hints++;
    if (
      o.type === "observation.workspace.edit" &&
      String(o.data.userEvent ?? "").startsWith("input.paste")
    )
      pastes++;
    if (o.type === "observation.workspace.page" && o.data.visible === false)
      left++;
  }
  return {
    t: Math.max(1, Math.round(active / 1000)),
    rd: Math.round(read / 1000),
    ks: keystrokes,
    ty: typos,
    w: peak,
    r: runs,
    g: green,
    p: pushes,
    h: hints,
    ps: pastes,
    lt: left,
  };
}
