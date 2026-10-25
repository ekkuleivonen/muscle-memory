/**
 * Active time: how long someone was working on an issue, from the activity recorded in the IDE.
 * Only the gaps between a person's own activity count, each up to a minute, and only within
 * one page load: time spent on other pages, in other tabs or apps, between sessions or waiting
 * on the test runner is not work time, so a paused or backgrounded attempt never reads as
 * uninterrupted work. It says nothing about attention or effort beyond that.
 */

/** What the IDE records when the person does something; the page and runtime are not activity. */
const ACTIVE = new Set([
  "observation.workspace.edit",
  "observation.workspace.keys",
  "observation.workspace.selection",
  "observation.workspace.scroll",
  "observation.workspace.clipboard",
  "observation.workspace.run",
  "observation.workspace.navigated",
]);

/** The longest gap between two activities that still counts as one stretch of work. */
export const ACTIVE_GAP_MS = 60_000;

/** The user event of a cursor the IDE put back on reopening, rather than one the person moved. */
export const RESTORED_SELECTION = "select.restore";

export interface TimedObservation {
  readonly type: string;
  readonly occurredAt: string;
  readonly source?: { readonly id: string; readonly sequence: number };
  readonly data: Readonly<Record<string, unknown>>;
}

function isActivity(o: TimedObservation): boolean {
  if (!ACTIVE.has(o.type)) return false;
  // The app restoring a cursor or showing a file on its own is not the person working.
  if (o.type === "observation.workspace.selection")
    return o.data.userEvent !== RESTORED_SELECTION;
  if (o.type === "observation.workspace.navigated") return o.data.via !== "app";
  return true;
}

/** Milliseconds of active work in these observations (any order, any number of page loads). */
export function activeTime(observations: readonly TimedObservation[]): number {
  const streams = new Map<string, TimedObservation[]>();
  for (const o of observations) {
    const id = o.source?.id ?? "";
    const stream = streams.get(id) ?? [];
    stream.push(o);
    streams.set(id, stream);
  }
  let total = 0;
  for (const stream of streams.values()) {
    stream.sort(
      (a, b) =>
        (a.source?.sequence ?? 0) - (b.source?.sequence ?? 0) ||
        a.occurredAt.localeCompare(b.occurredAt),
    );
    let previous: { at: number; runId?: unknown } | null = null;
    /** When the page was hidden, while it still is. */
    let hiddenSince: number | null = null;
    /** Hidden time since the previous activity. */
    let hidden = 0;
    for (const o of stream) {
      const at = Date.parse(o.occurredAt);
      if (!Number.isFinite(at)) continue;
      if (o.type === "observation.workspace.page" && typeof o.data.visible === "boolean") {
        if (!o.data.visible) hiddenSince ??= at;
        else if (hiddenSince !== null) {
          hidden += at - Math.max(hiddenSince, previous?.at ?? hiddenSince);
          hiddenSince = null;
        }
        continue;
      }
      if (!isActivity(o)) continue;
      const runId = o.type === "observation.workspace.run" ? o.data.runId : undefined;
      if (previous) {
        if (hiddenSince !== null) hidden += at - Math.max(hiddenSince, previous.at);
        // A run's own steps (queued, running, its result) with nothing in between are the
        // test runner working, not the person.
        const waiting = runId !== undefined && runId === previous.runId;
        if (!waiting)
          total += Math.min(Math.max(0, at - previous.at - hidden), ACTIVE_GAP_MS);
      }
      previous = { at, runId };
      hidden = 0;
      if (hiddenSince !== null) hiddenSince = at;
    }
  }
  return total;
}
