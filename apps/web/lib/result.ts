/**
 * The result card shown when a pull request is merged, and the shared link that carries it:
 * what happened, measured from this browser's own records (keystrokes, edits, runs, the page).
 * No score and no rank of anyone; a comparison with anonymous aggregates comes separately.
 * The link carries the numbers in its path, so anyone can open it without the sharer's data,
 * and nobody should trust it more than a screenshot. It carries the device's referral code,
 * never the participant ID.
 */
import type { Revision } from "../../../packages/content/model";
import { casesRun } from "../../../packages/content/model";
import { runFeedback, type WorkspaceRecord } from "../../../packages/domain/workspace";

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

export interface Result extends Metrics {
  readonly v: 2;
  /** Faster than this percent of the people who fixed the same issue, when there are enough. */
  readonly fp?: number;
  /** How many people the comparison is with, or that this is one of the first of. */
  readonly fn?: number;
  /** Issue key, e.g. QUICK-4. */
  readonly k: string;
  /** Language id. */
  readonly l: string;
  /** The sharer's referral code. */
  readonly c: string;
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
const TERMINAL = new Set(["result", "user-error", "runner-error", "timeout", "cancelled"]);
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph", "Fn"]);
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
      if (o.issue === issue && typeof o.occurredAt === "string" && o.occurredAt <= until)
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

  const opened = observations.find((o) => o.type === "observation.workspace.opened");
  const edited = observations.find((o) => o.type === "observation.workspace.edit");
  const read =
    opened && edited
      ? Math.max(0, Date.parse(edited.occurredAt) - Date.parse(opened.occurredAt))
      : 0;

  // Keys, per source (one page load), in the order they were pressed.
  const bySource = new Map<string, [number, string][]>();
  for (const o of observations)
    if (o.type === "observation.workspace.keys") {
      const keys = (o.data.keys as [number, string, string, string, boolean][]) ?? [];
      const list = bySource.get(o.source?.id ?? "") ?? [];
      for (const [t, kind, key] of keys) if (kind === "down") list.push([t, key]);
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
      const revision = o.issueRevision ? revisionFor(o.issueRevision) : undefined;
      const outcome = o.data.outcome as
        | { phase?: string; cases?: { output?: { text: string; truncated: boolean } }[] }
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
    if (o.type === "observation.workspace.edit" && String(o.data.userEvent ?? "").startsWith("input.paste"))
      pastes++;
    if (o.type === "observation.workspace.page" && o.data.visible === false) left++;
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

/** The card as a URL path segment: base64url of its JSON. */
export function encodeResult(result: Result): string {
  const bytes = new TextEncoder().encode(JSON.stringify(result));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const count = (v: unknown, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
const LIMITS: Record<keyof Metrics, number> = {
  t: 10_000_000,
  rd: 10_000_000,
  ks: 10_000_000,
  ty: 1_000_000,
  w: 1000,
  r: 100_000,
  g: 100_000,
  p: 100_000,
  h: 100,
  ps: 100_000,
  lt: 100_000,
};

/** A card from a link, or null when it is not one we would have made. */
export function decodeResult(segment: string): Result | null {
  try {
    const binary = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
    const value = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))),
    );
    const ok =
      value?.v === 2 &&
      typeof value.k === "string" &&
      /^[A-Z][A-Z0-9]{1,4}-[1-9]\d{0,3}$/.test(value.k) &&
      typeof value.l === "string" &&
      /^[a-z+#]{1,16}$/.test(value.l) &&
      typeof value.c === "string" &&
      /^[a-z0-9]{6,32}$/.test(value.c) &&
      (Object.keys(LIMITS) as (keyof Metrics)[]).every((k) => count(value[k], LIMITS[k]));
    if (!ok) return null;
    const metrics = Object.fromEntries(
      (Object.keys(LIMITS) as (keyof Metrics)[]).map((k) => [k, value[k]]),
    ) as unknown as Metrics;
    const comparison =
      count(value.fp, 100) && count(value.fn, 10_000_000) ? { fp: value.fp, fn: value.fn } : {};
    return { v: 2, k: value.k, l: value.l, c: value.c, ...metrics, ...comparison };
  } catch {
    return null;
  }
}

/** Everyone needs this many finishes of an issue before anyone is compared with them. */
export const COMPARE_FROM = 50;

/** One issue's percentiles, as tools/aggregates writes them. */
export interface Aggregate {
  readonly n: number;
  readonly language?: string;
  /** Active time in seconds at the 0th to 100th percentile. */
  readonly t?: readonly number[];
}

/**
 * How someone's active time compares with everyone who fixed the same issue: faster than
 * what percent, once there are enough people; otherwise just how few there are so far.
 */
export function compare(
  aggregate: Aggregate | undefined,
  seconds: number,
): { fasterThan?: number; people: number } {
  const people = aggregate?.n ?? 0;
  if (!aggregate?.t?.length || people < COMPARE_FROM) return { people };
  const slower = aggregate.t.filter((q) => q > seconds).length;
  return { fasterThan: Math.round((100 * slower) / aggregate.t.length), people };
}

/** The comparison line, or null when there is nothing to compare with. */
export function comparisonLine(result: Pick<Result, "fp" | "fn">, language: string): string | null {
  if (result.fp !== undefined) return `Faster than ${result.fp}% of people who fixed it in ${language}.`;
  if (result.fn !== undefined)
    return `One of the first ${COMPARE_FROM} people to fix it in ${language}.`;
  return null;
}

/** "4 min 12 s", "48 s". */
export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${seconds % 60} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** One sentence that says what happened, for posts and previews. */
export function sentence(result: Result, language: string): string {
  const time = result.t < 60 ? "under a minute" : `${Math.round(result.t / 60)} minutes`;
  const green =
    result.g === 1 ? " Green on the first run." : result.g ? ` Green on run ${result.g}.` : "";
  const comparison = result.fp !== undefined ? ` Faster than ${result.fp}% of people who fixed it.` : "";
  return `Fixed a real bug in ${language} without AI in ${time}.${green}${comparison}`;
}
