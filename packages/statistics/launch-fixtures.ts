/** Explicitly synthetic records for the launch query's tests and DataFusion check. No player data. */
export const fields = [
  "record_id", "kind", "type", "capture_version", "participant_id", "attempt_id", "challenge",
  "challenge_revision", "occurred_at", "received_at", "payload",
] as const;
export type Row = Record<(typeof fields)[number], string | null>;

export const revision = "sha256:" + "a".repeat(64);
export const qaRevision = "sha256:" + "c".repeat(64);
export const announcedAt = "2026-11-02T14:30:00.000Z";
export const asOf = "2026-11-03T14:30:00.000Z";
export const receipt = "https://example.com/synthetic-announcement";
/** A fixed "now" well after the as-of, so validation does not depend on the clock. */
export const now = new Date("2026-11-05T00:00:00.000Z");
const MIN = 60000;
/** An instant `minutes` from the announcement. */
export const at = (minutes: number) => new Date(Date.parse(announcedAt) + minutes * MIN).toISOString();

let n = 0;
export function record(
  type: string,
  attempt: string,
  minutes: number,
  o: {
    browser?: string; received?: number; data?: Record<string, unknown>; challenge?: string; revision?: string;
    actor?: string; terms?: string | null; capture?: string; id?: string;
  } = {},
): Row {
  const occurred = at(minutes);
  const payload = {
    type,
    actor: o.actor ?? "person",
    termsVersion: o.terms === undefined ? "2026-10-27.2" : o.terms,
    occurredAt: occurred,
    data: o.data ?? {},
  };
  return {
    record_id: o.id ?? `synthetic-${++n}`,
    kind: "observation",
    type,
    capture_version: o.capture ?? "practice-capture-1.2.0",
    participant_id: o.browser ?? `browser-${attempt}`,
    attempt_id: attempt,
    challenge: o.challenge ?? "PY-003",
    challenge_revision: o.revision ?? revision,
    occurred_at: occurred,
    received_at: at(o.received ?? minutes + 0.25),
    payload: JSON.stringify(payload),
  };
}

/** A whole attempt from `start` minutes after the announcement: started, a run, a failed then passing Submit. */
export function attempt(id: string, start: number, o: Parameters<typeof record>[3] & { from?: string | null; complete?: boolean } = {}): Row[] {
  const { from = "picker", complete = true, ...rest } = o;
  const startData = from === null ? {} : { from };
  return [
    record("practice.started", id, start, { ...rest, data: startData }),
    record("practice.opened", id, start + 0.1, rest),
    record("practice.run", id, start + 2, { ...rest, data: { runId: `${id}-r1`, status: "queued" } }),
    record("practice.submitted", id, start + 3, { ...rest, data: { runId: `${id}-s1`, result: "failed" } }),
    record("practice.submitted", id, start + 5, { ...rest, data: { runId: `${id}-s2`, result: "passed" } }),
    ...(complete ? [record("practice.completed", id, start + 5.1, rest)] : []),
  ];
}
