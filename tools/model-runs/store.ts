/**
 * Storing a run: both streams' records become rows with exactly the events table's columns
 * (apps/ingest/events.schema.json), so people's and models' data can be read the same way, but
 * they go to their own Iceberg table, `default.model_events`, never `default.events`. The
 * harness writes one NDJSON file per run into an outbox; ./store_events.py appends outbox
 * files to the table and moves each one to `stored/` once it is in.
 */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EventRow } from "../../packages/domain/ingest";
import type { StoredRecord } from "../../packages/domain/records";

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

/**
 * Writes a run's rows to `<outbox>/<runId>.ndjson`, through a temporary name so the store job
 * never reads half a file. Every record must be a model's.
 */
export async function writeOutbox(
  outbox: string,
  runId: string,
  records: readonly StoredRecord[],
  storedAt: string,
): Promise<string> {
  const lines = records.map((record) => {
    const row = rowOf(record, storedAt);
    const value = JSON.parse(record.payload);
    if (record.kind === "observation" && value.actor !== "model")
      throw new Error(`${record.recordId} is not a model's: model runs never hold people's data`);
    return JSON.stringify(row);
  });
  await mkdir(outbox, { recursive: true });
  const path = join(outbox, `${runId}.ndjson`);
  await writeFile(`${path}.partial`, lines.join("\n") + "\n");
  await rename(`${path}.partial`, path);
  return path;
}
