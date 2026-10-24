/**
 * Sends recorded practice to the ingest Worker (apps/ingest): the outbox in device storage,
 * oldest first, in gzipped batches. Records stay on the device after upload; only their
 * outbox entries go. A failed upload keeps them and retries with backoff, so nothing is lost
 * while the device keeps its storage. Runs only while `allowed()` (the current Terms accepted).
 */
import {
  BATCH_MAX_BYTES,
  BATCH_MAX_RECORDS,
  INGEST_PROTOCOL,
  sha256Hex,
} from "../domain/ingest";
import type { PracticeStore } from "./practice-store";

export interface UploaderOptions {
  /** Where the ingest Worker answers, e.g. "/ingest" on the app's own origin. */
  readonly endpoint: string;
  readonly store: () => Promise<PracticeStore>;
  readonly allowed: () => boolean;
  readonly fetch?: typeof fetch;
  readonly everyMs?: number;
  readonly now?: () => number;
}

/** Batches sent per round at most, so a large backlog drains without hogging the page. */
const BATCHES_PER_ROUND = 10;
/** keepalive requests (a page being hidden) may carry 64 KiB at most. */
const KEEPALIVE_MAX_BYTES = 60_000;

export type UploadStop = "deleted" | "claimed";

export class Uploader {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;
  private failures = 0;
  private retryAt = 0;
  /** Set when the server refuses this participant for good. */
  stopped: UploadStop | undefined;

  constructor(private readonly options: UploaderOptions) {}

  start(): void {
    this.timer ??= setInterval(() => void this.flush(), this.options.everyMs ?? 10_000);
    void this.flush();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * Uploads what is waiting. `keepalive` is for a page being hidden: one small batch, sent so
   * it may finish after the page is gone.
   */
  flush(keepalive = false): Promise<void> {
    if (keepalive) return this.round(true).catch(() => undefined);
    this.running ??= this.round(false)
      .catch(() => undefined)
      .finally(() => (this.running = undefined));
    return this.running;
  }

  private async round(keepalive: boolean): Promise<void> {
    const now = this.options.now?.() ?? Date.now();
    if (this.stopped || !this.options.allowed() || now < this.retryAt) return;
    const store = await this.options.store();
    const participantId = await store.participantId();
    const proof = await sha256Hex(await store.deviceSecret());
    for (let round = 0; round < (keepalive ? 1 : BATCHES_PER_ROUND); round++) {
      const { keys, records } = await store.pending(
        BATCH_MAX_RECORDS,
        keepalive ? KEEPALIVE_MAX_BYTES * 4 : BATCH_MAX_BYTES,
      );
      if (!keys.length) return;
      if (!records.length) {
        await store.sent(keys);
        continue;
      }
      const body = await gzip(
        JSON.stringify({ protocol: INGEST_PROTOCOL, participantId, proof, records }),
      );
      if (keepalive && body.byteLength > KEEPALIVE_MAX_BYTES) return;
      let response: Response;
      try {
        response = await (this.options.fetch ?? fetch)(
          `${this.options.endpoint}/v1/batches`,
          {
            method: "POST",
            headers: { "content-type": "application/json", "x-mm-encoding": "gzip" },
            body,
            keepalive,
            credentials: "same-origin",
          },
        );
      } catch {
        return this.backoff();
      }
      if (response.status === 410) this.stopped = "deleted";
      else if (response.status === 401) this.stopped = "claimed";
      // Only success empties the queue. A record the server refuses is reported in a
      // successful reply; a refused batch is a bug on our side, so it stays for a later fix.
      if (response.ok) await store.sent(keys);
      else return this.backoff();
      this.failures = 0;
      if (this.stopped) return;
    }
  }

  private backoff(): void {
    this.failures++;
    const delay = Math.min(10_000 * 2 ** (this.failures - 1), 5 * 60_000);
    this.retryAt = (this.options.now?.() ?? Date.now()) + delay;
  }
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}
