/**
 * Bounded, asynchronous capture buffer for practice observations. Recording never waits for
 * storage: observations get a source position and stable ID immediately and are written in
 * ordered batches later. Failed writes retry with backoff. When the buffer is full the
 * observation is dropped, its position stays consumed, and an explicit capture-gap
 * observation records the lost range once there is room again.
 */
import {
  PRACTICE_CAPTURE_VERSION,
  type PracticeData,
  type PracticeObservation,
  type PracticeType,
} from "../domain/practice";
import {
  envelope,
  toRecord,
  type Assignments,
  type CodeRevisionArtifact,
  type StoredRecord,
} from "../domain/records";
import { safeIdentifier } from "../domain/capture";

export type WriteOutcome = "written" | "duplicate" | "conflict";

/** Durable or session storage. Identical records deduplicate; a changed payload is a conflict. */
export interface CaptureSink {
  write(records: readonly StoredRecord[]): Promise<WriteOutcome[]>;
}

export interface RecorderOptions {
  readonly participantId: string;
  /** The page load this recording belongs to. */
  readonly sessionId: string;
  readonly sourceId: string;
  /** The accepted Terms version, such as 2026-10-25.1. */
  readonly termsVersion: string;
  readonly assignments?: Assignments;
  /** The challenge, the revision worked against, and the attempt. */
  readonly challenge: { readonly id: string; readonly revision: string };
  readonly attemptId: string;
  readonly sink: CaptureSink;
  readonly maxRecords?: number;
  readonly maxBytes?: number;
  readonly batchSize?: number;
  readonly flushDelayMs?: number;
  readonly retryBaseMs?: number;
  /**
   * Called when what the player should be told may have changed: the buffer becomes
   * non-empty or drains, a write starts or stops failing, or something is lost. Not called
   * per record while the buffer stays non-empty, so typing does not trigger re-renders.
   */
  readonly onTransition?: () => void;
  readonly now?: () => Date;
  /** A monotonic clock in milliseconds; performance.now() by default. */
  readonly monotonic?: () => number;
}

export interface CaptureStatus {
  readonly buffered: number;
  readonly bufferedBytes: number;
  readonly persisted: number;
  readonly lastSequence: number;
  /** Positions dropped and not yet disclosed by a stored gap observation. */
  readonly undisclosedDrops: number;
  readonly gaps: number;
  readonly artifactConflicts: number;
  /** Highest source position at or after which something was lost (0: nothing lost). */
  readonly lastLossSequence: number;
  readonly retrying: boolean;
  readonly lastError: string | null;
}

interface Entry {
  readonly record: StoredRecord;
  readonly bytes: number;
  readonly sequence?: number;
}

export class CaptureRecorder {
  private sequence = 0;
  private readonly queue: Entry[] = [];
  private queuedBytes = 0;
  private persisted = 0;
  private gaps = 0;
  private lastLoss = 0;
  private readonly conflicted = new Set<string>();
  private transitionKey = "";
  private readonly artifacts = new Set<string>();
  private conflicts = 0;
  private dropped: {
    from: number;
    to: number;
    reason: "buffer-full" | "write-conflict";
  }[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flushing: Promise<void> | undefined;
  private failures = 0;
  private lastError: string | null = null;
  private stopped = false;
  private readonly maxRecords: number;
  private readonly maxBytes: number;

  private readonly origin: number;

  constructor(private readonly options: RecorderOptions) {
    this.origin = this.clock();
    safeIdentifier(options.participantId);
    safeIdentifier(options.sourceId);
    this.maxRecords = options.maxRecords ?? 1000;
    this.maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
  }

  /**
   * Records one observation with any artifacts it references. Returns the observation, or
   * null when it was dropped (its position becomes an explicit gap).
   */
  observe<T extends PracticeType>(
    type: T,
    data: PracticeData[T],
    artifacts: readonly CodeRevisionArtifact[] = [],
  ): PracticeObservation<T> | null {
    if (this.stopped) return null;
    const sequence = ++this.sequence;
    const observation = this.envelope(type, sequence, data);
    // An artifact (one code revision) is stored once, however many observations cite it.
    const fresh = artifacts.filter(
      (artifact) => !this.artifacts.has(artifact.artifactId),
    );
    const entries: Entry[] = [
      ...fresh.map((artifact) => entry(toRecord(artifact))),
      entry(toRecord(observation), sequence),
    ];
    // One slot and some bytes stay reserved so a gap can always be disclosed.
    if (!this.fits(entries, 1, 1024)) {
      this.drop(sequence, "buffer-full");
      this.transition();
      return null;
    }
    for (const artifact of fresh) this.artifacts.add(artifact.artifactId);
    this.enqueue(entries);
    this.schedule(this.options.flushDelayMs ?? 250);
    this.transition();
    return observation;
  }

  private envelope<T extends PracticeType>(
    type: T,
    sequence: number,
    data: PracticeData[T],
  ): PracticeObservation<T> {
    return envelope(type, PRACTICE_CAPTURE_VERSION, {
      participantId: this.options.participantId,
      sessionId: this.options.sessionId,
      sourceId: this.options.sourceId,
      sequence,
      occurredAt: (this.options.now?.() ?? new Date()).toISOString(),
      elapsedMs: this.elapsed(),
      termsVersion: this.options.termsVersion,
      assignments: this.options.assignments,
      challenge: this.options.challenge,
      attemptId: this.options.attemptId,
    }, data);
  }

  /** Milliseconds since this source stream started, on the monotonic clock. */
  elapsed(): number {
    return Math.round((this.clock() - this.origin) * 10) / 10;
  }

  private clock(): number {
    return this.options.monotonic?.() ?? performance.now();
  }

  /** Stores a record that is not participant activity, such as shared content. */
  include(record: StoredRecord): void {
    if (this.stopped) return;
    this.enqueue([entry(record)]);
    this.schedule(this.options.flushDelayMs ?? 250);
    this.transition();
  }

  /**
   * True when this artifact ID was found holding different stored content. The stored
   * payload is kept, and the artifact is never written again, so later references to it
   * still point at the conflicting record.
   */
  artifactConflicted(artifactId: string): boolean {
    return this.conflicted.has(artifactId);
  }

  status(): CaptureStatus {
    return {
      buffered: this.queue.length,
      bufferedBytes: this.queuedBytes,
      persisted: this.persisted,
      lastSequence: this.sequence,
      undisclosedDrops: this.dropped.reduce(
        (sum, range) => sum + range.to - range.from + 1,
        0,
      ),
      gaps: this.gaps,
      artifactConflicts: this.conflicts,
      lastLossSequence: this.lastLoss,
      retrying: this.failures > 0,
      lastError: this.lastError,
    };
  }

  /** Writes everything buffered now; resolves when the buffer is empty or a write fails. */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    while (!this.stopped) {
      // One batch in flight at a time, so batches stay in source order.
      while (this.flushing) await this.flushing;
      if (!this.queue.length || this.stopped) return;
      this.flushing = this.writeBatch().finally(
        () => (this.flushing = undefined),
      );
      await this.flushing;
      if (this.failures) return;
    }
  }

  /** Stops capture and discards the buffer, after any write already in flight settles. */
  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.flushing?.catch(() => undefined);
    this.queue.length = 0;
    this.queuedBytes = 0;
    this.dropped = [];
  }

  private async writeBatch(): Promise<void> {
    const batch = this.queue.slice(0, this.options.batchSize ?? 100);
    let outcomes: WriteOutcome[];
    try {
      outcomes = await this.options.sink.write(
        batch.map((item) => item.record),
      );
      if (outcomes.length !== batch.length)
        throw new Error("Storage returned an incomplete result.");
    } catch (error) {
      this.failures++;
      this.lastError = error instanceof Error ? error.message : String(error);
      // Exponential backoff, capped; records keep their IDs, so a retry deduplicates.
      this.schedule(
        Math.min((this.options.retryBaseMs ?? 250) * 2 ** this.failures, 8000),
      );
      this.transition();
      return;
    }
    if (this.stopped) return;
    this.failures = 0;
    this.lastError = null;
    batch.forEach((item, index) => {
      this.queuedBytes -= item.bytes;
      if (outcomes[index] !== "conflict") this.persisted++;
      else if (item.sequence) this.drop(item.sequence, "write-conflict");
      else {
        // An artifact ID already holds different content: keep the stored one, say so.
        // Conservatively, everything recorded so far may depend on it.
        this.conflicts++;
        this.conflicted.add(item.record.recordId);
        this.lastLoss = Math.max(this.lastLoss, this.sequence);
        this.lastError = `${item.record.recordId} already exists with different content.`;
      }
    });
    this.queue.splice(0, batch.length);
    this.discloseGaps();
    if (this.queue.length) this.schedule(0);
    this.transition();
  }

  private transition(): void {
    const key = [
      this.queue.length > 0,
      this.failures > 0,
      this.lastLoss,
      this.gaps,
      this.dropped.length,
      this.conflicts,
    ].join();
    if (key === this.transitionKey) return;
    this.transitionKey = key;
    this.options.onTransition?.();
  }

  private discloseGaps(): void {
    while (this.dropped.length) {
      const range = this.dropped[0];
      const sequence = ++this.sequence;
      const gap = toRecord(
        this.envelope("practice.capture-gap", sequence, {
          fromSequence: range.from,
          toSequence: range.to,
          reason: range.reason,
        }),
      );
      const item = entry(gap, sequence);
      if (!this.fits([item], 0, 0)) {
        this.sequence--;
        return;
      }
      this.dropped.shift();
      this.gaps++;
      this.enqueue([item]);
    }
  }

  private drop(
    sequence: number,
    reason: "buffer-full" | "write-conflict",
  ): void {
    this.lastLoss = Math.max(this.lastLoss, sequence);
    const last = this.dropped.at(-1);
    if (last && last.reason === reason && last.to === sequence - 1)
      last.to = sequence;
    else this.dropped.push({ from: sequence, to: sequence, reason });
  }

  private fits(
    entries: readonly Entry[],
    reserveRecords: number,
    reserveBytes: number,
  ): boolean {
    const bytes = entries.reduce((sum, item) => sum + item.bytes, 0);
    return (
      this.queue.length + entries.length + reserveRecords <= this.maxRecords &&
      this.queuedBytes + bytes + reserveBytes <= this.maxBytes
    );
  }

  private enqueue(entries: readonly Entry[]): void {
    for (const item of entries) {
      this.queue.push(item);
      this.queuedBytes += item.bytes;
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped || this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush().catch(() => undefined);
    }, delayMs);
  }
}

function entry(record: StoredRecord, sequence?: number): Entry {
  return { record, bytes: record.payload.length * 2, sequence };
}

/** Session-only default: records live in this page's memory and vanish when it closes. */
export class MemorySink implements CaptureSink {
  readonly records = new Map<string, StoredRecord>();
  async write(records: readonly StoredRecord[]): Promise<WriteOutcome[]> {
    return records.map((record) => {
      const existing = this.records.get(record.recordId);
      if (!existing) {
        this.records.set(record.recordId, record);
        return "written";
      }
      return existing.payload === record.payload ? "duplicate" : "conflict";
    });
  }
  clear(): void {
    this.records.clear();
  }
}
