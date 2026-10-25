/**
 * What the device can forget once it is uploaded. Practice needs only each challenge's latest
 * attempt (its code to restore, and its submissions for the result card), so everything else
 * that has left the outbox goes: site records, earlier attempts, and code copies no kept
 * observation's source made. Anything still queued for upload stays, whatever it is.
 */
import type { StoredRecord } from "../domain/records";

interface Parsed {
  readonly record: StoredRecord;
  readonly type: string;
  readonly source: string | null;
  readonly challenge: string | null;
  readonly attempt: string | null;
  readonly at: string;
}

function parse(record: StoredRecord): Parsed {
  try {
    const value = JSON.parse(record.payload);
    return {
      record,
      type: String(value.type ?? ""),
      source: typeof value.source?.id === "string" ? value.source.id : null,
      challenge: typeof value.challenge === "string" ? value.challenge : null,
      attempt: typeof value.attemptId === "string" ? value.attemptId : null,
      at: String(value.occurredAt ?? ""),
    };
  } catch {
    return { record, type: "", source: null, challenge: null, attempt: null, at: "" };
  }
}

/** Record IDs that can be deleted: uploaded, and not part of a challenge's latest attempt. */
export function compactable(
  records: readonly StoredRecord[],
  queued: ReadonlySet<string>,
): string[] {
  const parsed = records.map(parse);
  // Each challenge's latest attempt: that of its most recent practice observation.
  const latest = new Map<string, { attempt: string; at: string }>();
  for (const p of parsed)
    if (p.type.startsWith("practice.") && p.challenge && p.attempt) {
      const seen = latest.get(p.challenge);
      if (!seen || p.at > seen.at) latest.set(p.challenge, { attempt: p.attempt, at: p.at });
    }
  const keep = (p: Parsed) =>
    queued.has(p.record.recordId) ||
    (p.type.startsWith("practice.") &&
      p.challenge !== null &&
      latest.get(p.challenge)?.attempt === p.attempt);
  const kept = parsed.filter((p) => p.record.kind === "observation" && keep(p));
  const sources = new Set(kept.map((p) => p.source));
  return parsed
    .filter((p) =>
      p.record.kind === "artifact"
        ? !queued.has(p.record.recordId) &&
          ![...sources].some((source) => source && p.record.recordId.startsWith(`${source}.`))
        : !keep(p),
    )
    .map((p) => p.record.recordId);
}
