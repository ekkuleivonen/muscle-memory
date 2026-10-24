/**
 * Local capture-first evidence store: artifacts, observations and projections share one
 * append-only record table and export outbox. Not imported by the Cloudflare app runtime.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { safeIdentifier } from "../domain/events";
import {
  encodeRecord,
  verifyCapture,
  type CapturedSubmission,
  type ContentArtifact,
  type SubmissionArtifact,
  type SubmissionObservation,
} from "../domain/evidence";
import type { AssessmentProjection, Evidence } from "../domain/projection";
import {
  isPosition,
  orderSource,
  type SourcePosition,
  type SourceStream,
} from "../domain/source-order";
import type {
  EventOutbox,
  ParticipantDeletionStore,
  StoredEvent,
} from "./contracts";

type Kind =
  | "artifact.content"
  | "artifact.submission"
  | "observation.submission"
  | "projection.assessment";

export class SqliteEvidenceStore
  implements EventOutbox, ParticipantDeletionStore
{
  private readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    const schema = this.db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    if (![0, 1].includes(schema.user_version)) {
      this.db.close();
      throw new Error("Unsupported local evidence database version.");
    }
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA user_version = 1;
      -- participant_id is NULL only for shared published content, which deletion never touches.
      CREATE TABLE IF NOT EXISTS evidence_records (
        record_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK(kind IN ('artifact.content','artifact.submission','observation.submission','projection.assessment')),
        participant_id TEXT CHECK((kind = 'artifact.content') = (participant_id IS NULL)),
        payload TEXT NOT NULL,
        export_state TEXT NOT NULL DEFAULT 'pending' CHECK(export_state IN ('pending','exported'))
      );
      -- Finds one source stream's observations. Sequences are read from the parsed payload, not
      -- by SQLite, so legacy values keep their JSON type (true, 1e300, unsafe integers).
      CREATE INDEX IF NOT EXISTS observation_source_stream ON evidence_records(
        participant_id,
        json_extract(payload, '$.source.id')
      ) WHERE kind = 'observation.submission';
      CREATE TABLE IF NOT EXISTS deleted_participants (
        participant_id TEXT PRIMARY KEY
      );
      CREATE TABLE IF NOT EXISTS pending_file_deletions (
        record_id TEXT PRIMARY KEY,
        participant_id TEXT NOT NULL REFERENCES deleted_participants(participant_id)
      );
    `);
  }

  /**
   * Commits content artifacts, the bounded submission and its observation with pending
   * exports in one transaction. Nothing here parses or scores the submission.
   */
  capture(captured: CapturedSubmission): {
    observationId: string;
    duplicate: boolean;
  } {
    verifyCapture(captured);
    const { observation, submission } = captured;
    return this.transaction(() => {
      this.assertWritable(observation.participantId);
      this.assertPositionFree(observation);
      for (const artifact of captured.artifacts)
        this.put(artifact.artifactId, artifact.type, null, artifact);
      this.put(
        submission.artifactId,
        submission.type,
        submission.participantId,
        submission,
      );
      const duplicate = this.put(
        observation.observationId,
        observation.type,
        observation.participantId,
        observation,
      );
      return { observationId: observation.observationId, duplicate };
    });
  }

  /** Appends a derived result; earlier projections and the evidence stay unchanged. */
  appendProjection(projection: AssessmentProjection): {
    projectionId: string;
    duplicate: boolean;
  } {
    safeIdentifier(projection.projectionId);
    if (
      projection.schemaVersion !== "1.0.0" ||
      projection.type !== "projection.assessment"
    )
      throw new Error("Unsupported projection schema.");
    return this.transaction(() => {
      this.assertWritable(projection.participantId);
      for (const id of [
        ...projection.observationIds,
        ...projection.artifactIds,
      ]) {
        const row = this.row(id);
        if (!row) throw new Error(`Projection references missing ${id}.`);
        if (
          row.participant_id !== null &&
          row.participant_id !== projection.participantId
        )
          throw new Error(
            "Projection references another participant's evidence.",
          );
      }
      const duplicate = this.put(
        projection.projectionId,
        projection.type,
        projection.participantId,
        projection,
      );
      return { projectionId: projection.projectionId, duplicate };
    });
  }

  /** Reads one observation with the exact artifacts it references, as stored. */
  evidence(observationId: string): Evidence {
    const observation = this.record<SubmissionObservation>(observationId);
    return {
      observation,
      submission: this.record<SubmissionArtifact>(
        observation.submissionArtifactId,
      ),
      adventure: this.record<ContentArtifact>(observation.adventureArtifactId),
      challenge: this.record<ContentArtifact>(observation.challengeArtifactId),
    };
  }

  projections(observationId: string): AssessmentProjection[] {
    return (
      this.db
        .prepare(
          "SELECT payload FROM evidence_records WHERE kind = 'projection.assessment' AND EXISTS (SELECT 1 FROM json_each(payload, '$.observationIds') WHERE value = ?) ORDER BY record_id",
        )
        .all(observationId) as { payload: string }[]
    ).map((row) => JSON.parse(row.payload));
  }

  /** One participant's one source, in sequence order, with missing-range diagnostics. */
  sourceStream(
    participantId: string,
    sourceId: string,
    maxRanges?: number,
  ): SourceStream {
    safeIdentifier(participantId);
    safeIdentifier(sourceId);
    return orderSource(
      participantId,
      sourceId,
      this.positions(participantId, sourceId),
      maxRanges,
    );
  }

  get(recordId: string): StoredEvent | undefined {
    const row = this.row(recordId);
    return row && { eventId: recordId, payload: row.payload };
  }

  pending(): StoredEvent[] {
    return this.db
      .prepare(
        "SELECT record_id AS eventId, payload FROM evidence_records WHERE export_state = 'pending' ORDER BY record_id",
      )
      .all() as unknown as StoredEvent[];
  }

  acknowledge(recordId: string, payload: string): void {
    const result = this.db
      .prepare(
        "UPDATE evidence_records SET export_state = 'exported' WHERE record_id = ? AND payload = ?",
      )
      .run(recordId, payload);
    if (result.changes !== 1)
      throw new Error("Cannot acknowledge a missing or changed record.");
  }

  /** Removes every participant-owned record (submissions, observations, projections); shared content stays. */
  beginParticipantDeletion(participantId: string): string[] {
    safeIdentifier(participantId);
    this.transaction(() => {
      this.db
        .prepare(
          "INSERT OR IGNORE INTO deleted_participants(participant_id) VALUES (?)",
        )
        .run(participantId);
      this.db
        .prepare(
          "INSERT OR IGNORE INTO pending_file_deletions(record_id, participant_id) SELECT record_id, participant_id FROM evidence_records WHERE participant_id = ?",
        )
        .run(participantId);
      this.db
        .prepare("DELETE FROM evidence_records WHERE participant_id = ?")
        .run(participantId);
    });
    return (
      this.db
        .prepare(
          "SELECT record_id AS recordId FROM pending_file_deletions WHERE participant_id = ? ORDER BY record_id",
        )
        .all(participantId) as { recordId: string }[]
    ).map((row) => row.recordId);
  }

  confirmFileDeleted(recordId: string): void {
    this.db
      .prepare("DELETE FROM pending_file_deletions WHERE record_id = ?")
      .run(recordId);
  }

  close(): void {
    this.db.close();
  }

  /** Inserts once; identical retry is a duplicate, different content under the same ID fails. */
  private put(
    recordId: string,
    kind: Kind,
    participantId: string | null,
    record: object,
  ): boolean {
    safeIdentifier(recordId);
    if (
      this.db
        .prepare("SELECT 1 FROM pending_file_deletions WHERE record_id = ?")
        .get(recordId)
    )
      throw new Error("Record ID is awaiting archive deletion.");
    const payload = encodeRecord(record);
    const existing = this.row(recordId);
    if (existing) {
      if (existing.payload !== payload)
        throw new Error(`${recordId} already exists with different content.`);
      return true;
    }
    this.db
      .prepare(
        "INSERT INTO evidence_records(record_id, kind, participant_id, payload) VALUES (?, ?, ?, ?)",
      )
      .run(recordId, kind, participantId, payload);
    return false;
  }

  /** A different observation may not claim a position already taken in the same stream. */
  /**
   * A new observation may not claim a position already taken in the same stream. An
   * already-stored observation is a retry, not a claim: `put` deduplicates it or rejects
   * changed content, even where legacy records share its position.
   */
  private assertPositionFree(observation: SubmissionObservation): void {
    if (this.row(observation.observationId)) return;
    // Only valid positions occupy one: a legacy `true` or unsafe integer never blocks `1`.
    const claimed = this.positions(
      observation.participantId,
      observation.source.id,
    ).find(
      (entry) =>
        isPosition(entry.sequence) &&
        entry.sequence === observation.source.sequence,
    );
    if (claimed)
      throw new Error(
        `Source position ${observation.source.id}#${observation.source.sequence} is already claimed by ${claimed.observationId}.`,
      );
  }

  /** Sequences exactly as stored in each observation's JSON, including invalid legacy values. */
  private positions(participantId: string, sourceId: string): SourcePosition[] {
    return (
      this.db
        .prepare(
          "SELECT record_id, payload FROM evidence_records WHERE kind = 'observation.submission' AND participant_id = ? AND json_extract(payload, '$.source.id') = ?",
        )
        .all(participantId, sourceId) as {
        record_id: string;
        payload: string;
      }[]
    ).map((row) => ({
      observationId: row.record_id,
      sequence: JSON.parse(row.payload).source?.sequence,
    }));
  }

  private assertWritable(participantId: string): void {
    safeIdentifier(participantId);
    if (
      this.db
        .prepare("SELECT 1 FROM deleted_participants WHERE participant_id = ?")
        .get(participantId)
    )
      throw new Error("Participant was deleted locally; use a new ID.");
  }

  private row(
    recordId: string,
  ): { payload: string; participant_id: string | null } | undefined {
    return this.db
      .prepare(
        "SELECT payload, participant_id FROM evidence_records WHERE record_id = ?",
      )
      .get(recordId) as
      | { payload: string; participant_id: string | null }
      | undefined;
  }

  private record<T>(recordId: string): T {
    const row = this.row(recordId);
    if (!row) throw new Error(`Missing evidence record ${recordId}.`);
    return JSON.parse(row.payload);
  }

  private transaction<T>(run: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
