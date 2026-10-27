/**
 * Records a run's model stream: positions from 1, the run's clock, blobs stored once under
 * their hash, and streamed lines written about once a second (or every 200 lines) so a long
 * response is a handful of observations, not thousands. Everything is kept in memory, in
 * order, and stored with the run.
 */
import { sha256 } from "../domain/ingest";
import type { Assignments, StoredRecord } from "../domain/records";
import { toRecord } from "../domain/records";
import {
  blobArtifact,
  blobRecord,
  modelObservation,
  type ChunkLine,
  type ModelData,
  type ModelObservation,
  type ModelType,
} from "../domain/model";

const LINES_EVERY_MS = 1000;
const LINES_AT_MOST = 200;

export interface ModelRecorderOptions {
  readonly participantId: string;
  readonly sessionId: string;
  readonly sourceId: string;
  readonly challenge: { readonly key: string; readonly revision: string };
  readonly attemptId: string;
  readonly assignments?: Assignments;
  /** The run's clock, and the reading its elapsed times count from. */
  readonly clock: () => number;
  readonly origin: number;
}

export class ModelRecorder {
  readonly records: StoredRecord[] = [];
  private sequence = 0;
  private readonly blobs = new Set<string>();
  private pending: { turn: number; attempt: number; lines: ChunkLine[]; first: number } | null = null;

  constructor(private readonly options: ModelRecorderOptions) {}

  /** Elapsed time on the run's clock, in 0.1 ms steps like the practice stream. */
  elapsed(): number {
    return Math.round((this.options.clock() - this.options.origin) * 10) / 10;
  }

  observe<T extends ModelType>(type: T, data: ModelData[T]): ModelObservation<T> {
    if (type !== "model.chunks") this.writeLines();
    return this.write(type, data);
  }

  /** Stores text once under its SHA-256 and returns its artifact id. */
  blob(text: string, mediaType: string): { artifactId: string; bytes: number } {
    // Synchronous, and the same in Node and the browser.
    const hash = [...sha256(new TextEncoder().encode(text))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const blob = blobArtifact(this.options.participantId, mediaType, text, hash);
    if (!this.blobs.has(blob.artifactId)) {
      this.blobs.add(blob.artifactId);
      this.records.push(blobRecord(blob));
    }
    return { artifactId: blob.artifactId, bytes: blob.bytes };
  }

  /** A streamed line; lines of one request are batched. */
  line(turn: number, attempt: number, line: ChunkLine): void {
    if (this.pending && (this.pending.turn !== turn || this.pending.attempt !== attempt))
      this.writeLines();
    this.pending ??= { turn, attempt, lines: [], first: line[0] };
    this.pending.lines.push(line);
    if (this.pending.lines.length >= LINES_AT_MOST || line[0] - this.pending.first >= LINES_EVERY_MS)
      this.writeLines();
  }

  /** Writes the lines waiting, as one observation. */
  writeLines(): void {
    const pending = this.pending;
    this.pending = null;
    if (pending?.lines.length)
      this.write("model.chunks", { turn: pending.turn, attempt: pending.attempt, lines: pending.lines });
  }

  private write<T extends ModelType>(type: T, data: ModelData[T]): ModelObservation<T> {
    const observation = modelObservation(
      type,
      {
        participantId: this.options.participantId,
        sessionId: this.options.sessionId,
        sourceId: this.options.sourceId,
        sequence: ++this.sequence,
        occurredAt: new Date().toISOString(),
        elapsedMs: this.elapsed(),
        assignments: this.options.assignments,
        challenge: this.options.challenge,
        attemptId: this.options.attemptId,
      },
      data,
    );
    this.records.push(toRecord(observation));
    return observation;
  }
}
