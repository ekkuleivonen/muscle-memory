/** Explicitly synthetic browsers for cohort tests and the DataFusion check. No player data. */
import { trace } from "../developer-profile/fixtures";
import type { StoredRecord } from "../domain/records";

export const fields = ["record_id", "type", "participant_id", "attempt_id", "challenge", "challenge_revision", "occurred_at", "kind", "payload"];
export type Event = Record<(typeof fields)[number], string | null>;
const toEvent = (r: StoredRecord): Event => {
  const o = JSON.parse(r.payload);
  return {
    record_id: r.recordId,
    type: o.type,
    participant_id: o.participantId,
    attempt_id: o.attemptId ?? null,
    challenge: o.challenge ?? null,
    challenge_revision: o.challengeRevision ?? null,
    occurred_at: o.occurredAt,
    kind: r.kind,
    payload: r.payload,
  };
};
/** One synthetic browser's attempt: the shared fixture under its own IDs. */
export function browser(
  id: string,
  attempt = "a",
  options: { again?: boolean; actor?: string; at?: number; noTerms?: boolean; noOrigin?: boolean } = {},
): Event[] {
  return trace(`${id}-${attempt}`, `${id}-${attempt}-source`).map((r) => {
    const o = JSON.parse(r.payload);
    o.participantId = id;
    o.observationId = `${id}-${attempt}-${o.observationId}`;
    if (options.actor) o.actor = options.actor;
    if (options.noTerms) delete o.termsVersion;
    if (options.again && o.type === "practice.started") o.data.from = "again";
    if (options.noOrigin && o.type === "practice.started") delete o.data.from;
    if (options.at) o.occurredAt = new Date(Date.parse(o.occurredAt) + options.at).toISOString();
    return toEvent({ ...r, recordId: o.observationId, participantId: id, payload: JSON.stringify(o) });
  });
}
let n = 0;
export function profile(id: string, answers: Record<string, unknown>, at: string): Event {
  const record = `profile-${++n}`;
  return {
    record_id: record,
    type: "site.profile",
    participant_id: id,
    attempt_id: null,
    challenge: null,
    challenge_revision: null,
    occurred_at: at,
    kind: "observation",
    payload: JSON.stringify({ type: "site.profile", actor: "person", participantId: id, observationId: record, occurredAt: at, data: { from: "settings", answers } }),
  };
}
export const ADULT = { age: "25-34", stealth: false };
/** Eligible browsers: each has an attempt and a latest profile stating an adult band and not stealth. */
export const many = (count: number, prefix = "b") =>
  Array.from({ length: count }, (_, i) => [...browser(`${prefix}${i}`), profile(`${prefix}${i}`, ADULT, "2026-10-01T00:00:00.000Z")]).flat();

