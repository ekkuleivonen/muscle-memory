/**
 * Storing a run: both streams' records become rows with exactly the events table's columns
 * (apps/ingest/events.schema.json), so people's and models' data can be read the same way, but
 * they go to their own Iceberg table, `default.model_events`, never `default.events`. A run's
 * rows are one NDJSON file in an outbox (a directory on a work machine, private R2 from the
 * admin); tools/model-runs/store_events.py appends outbox files to the table.
 */
import type { EventRow } from "../domain/ingest";
import type { StoredRecord } from "../domain/records";

/** The row of one record. `received_at` is when the harness stored it; there is no country. */
export function rowOf(record: StoredRecord, storedAt: string): EventRow {
  const value = JSON.parse(record.payload) as Record<string, any>;
  const text = (v: unknown) => (typeof v === "string" ? v : null);
  const observation = record.kind === "observation";
  return {
    record_id: record.recordId,
    kind: record.kind,
    participant_id: record.participantId,
    received_at: storedAt,
    country: null,
    type: String(value.type),
    capture_version: text(value.captureVersion),
    session_id: observation ? text(value.sessionId) : null,
    source_id: observation ? text(value.source?.id) : null,
    sequence: observation ? (value.source?.sequence ?? null) : null,
    occurred_at: observation ? text(value.occurredAt) : null,
    elapsed_ms: observation && typeof value.elapsedMs === "number" ? value.elapsedMs : null,
    challenge: observation ? text(value.challenge) : null,
    challenge_revision: observation ? text(value.challengeRevision) : null,
    attempt_id: observation ? text(value.attemptId) : null,
    terms_version: observation ? text(value.termsVersion) : null,
    payload: record.payload,
  };
}

/** A run's rows as NDJSON. Every record must be a model's: runs never hold people's data. */
export function runNdjson(records: readonly StoredRecord[], storedAt: string): string {
  return (
    records
      .map((record) => {
        if (record.kind === "observation" && JSON.parse(record.payload).actor !== "model")
          throw new Error(`${record.recordId} is not a model's: model runs never hold people's data`);
        return JSON.stringify(rowOf(record, storedAt));
      })
      .join("\n") + "\n"
  );
}
