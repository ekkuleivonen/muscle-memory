/**
 * The upload protocol between the browser and the ingest Worker (apps/ingest), shared by both.
 * A batch is the device's records exactly as stored, plus the participant's proof: the SHA-256
 * of a secret only that device knows. The server keeps the first proof it sees for an ID and
 * refuses batches with any other, so nobody can add to someone else's data; deleting needs
 * the secret itself. Each accepted record becomes one row, with the stored payload kept
 * verbatim as the raw record.
 */
import { safeIdentifier } from "./capture";
import { PRACTICE_CAPTURE_VERSION } from "./practice";
import type { StoredRecord } from "./records";
import { SITE_CAPTURE_VERSION } from "./site";

export const INGEST_PROTOCOL = "ingest-1";
/** At most this many records, and this many bytes of payload, per batch. */
export const BATCH_MAX_RECORDS = 500;
export const BATCH_MAX_BYTES = 1_000_000;
/** Capture versions the server accepts: the current one of each stream. */
export const ACCEPTED_CAPTURE = [PRACTICE_CAPTURE_VERSION, SITE_CAPTURE_VERSION] as const;

export interface Batch {
  readonly protocol: typeof INGEST_PROTOCOL;
  readonly participantId: string;
  /** Hex SHA-256 of the device secret. */
  readonly proof: string;
  readonly records: readonly StoredRecord[];
}

/** One row of the events table: the envelope as columns, the payload verbatim. */
export interface EventRow {
  readonly record_id: string;
  readonly kind: "observation" | "artifact";
  readonly participant_id: string;
  /** Server receipt, ISO time: the time to partition and trust. */
  readonly received_at: string;
  readonly type: string;
  readonly capture_version: string | null;
  readonly session_id: string | null;
  readonly source_id: string | null;
  readonly sequence: number | null;
  readonly occurred_at: string | null;
  readonly elapsed_ms: number | null;
  readonly challenge: string | null;
  readonly challenge_revision: string | null;
  readonly attempt_id: string | null;
  readonly terms_version: string | null;
  /** The record exactly as the device stored it (canonical JSON). */
  readonly payload: string;
}

export type Verdict =
  | { readonly ok: true; readonly row: EventRow }
  | { readonly ok: false; readonly recordId: string; readonly reason: string };

const HEX64 = /^[0-9a-f]{64}$/;

/** Checks a batch's shape; records are checked one by one with `checkRecord`. */
export function checkBatch(value: unknown): Batch {
  const batch = value as Batch;
  if (!batch || batch.protocol !== INGEST_PROTOCOL) throw new Error("Unknown protocol.");
  safeIdentifier(batch.participantId);
  if (typeof batch.proof !== "string" || !HEX64.test(batch.proof))
    throw new Error("A batch needs its proof.");
  if (!Array.isArray(batch.records) || !batch.records.length)
    throw new Error("A batch needs records.");
  if (batch.records.length > BATCH_MAX_RECORDS) throw new Error("Too many records.");
  const bytes = batch.records.reduce(
    (sum, r) => sum + (typeof r?.payload === "string" ? r.payload.length : 0),
    0,
  );
  if (bytes > BATCH_MAX_BYTES) throw new Error("The batch is too large.");
  return batch;
}

/** Validates one record against its batch and turns it into a row. Never throws. */
export function checkRecord(
  record: StoredRecord,
  participantId: string,
  receivedAt: string,
): Verdict {
  const recordId = typeof record?.recordId === "string" ? record.recordId : "";
  const refuse = (reason: string): Verdict => ({ ok: false, recordId, reason });
  try {
    safeIdentifier(recordId);
  } catch {
    return refuse("bad record id");
  }
  if (record.participantId !== participantId) return refuse("another participant");
  if (record.kind !== "observation" && record.kind !== "artifact") return refuse("unknown kind");
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(record.payload);
  } catch {
    return refuse("payload is not JSON");
  }
  if (!value || typeof value !== "object" || value.participantId !== participantId)
    return refuse("payload names another participant");
  const type = String(value.type ?? "");
  const capture = typeof value.captureVersion === "string" ? value.captureVersion : null;
  if (record.kind === "artifact") {
    if (type !== "artifact.code-revision" || value.artifactId !== recordId)
      return refuse("not a code revision artifact");
    if (capture !== PRACTICE_CAPTURE_VERSION) return refuse("unknown capture version");
    return {
      ok: true,
      row: {
        record_id: recordId,
        kind: "artifact",
        participant_id: participantId,
        received_at: receivedAt,
        type,
        capture_version: capture,
        session_id: null,
        source_id: null,
        sequence: null,
        occurred_at: null,
        elapsed_ms: null,
        challenge: null,
        challenge_revision: null,
        attempt_id: null,
        terms_version: null,
        payload: record.payload,
      },
    };
  }
  const stream = type.startsWith("practice.")
    ? PRACTICE_CAPTURE_VERSION
    : type.startsWith("site.")
      ? SITE_CAPTURE_VERSION
      : null;
  if (!stream) return refuse("unknown observation type");
  if (value.observationId !== recordId) return refuse("record id does not match");
  if (capture !== stream) return refuse("unknown capture version");
  const source = value.source as { id?: unknown; sequence?: unknown } | undefined;
  if (typeof source?.id !== "string" || !Number.isSafeInteger(source.sequence))
    return refuse("no source position");
  if (typeof value.occurredAt !== "string" || Number.isNaN(Date.parse(value.occurredAt)))
    return refuse("no time");
  const text = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    ok: true,
    row: {
      record_id: recordId,
      kind: "observation",
      participant_id: participantId,
      received_at: receivedAt,
      type,
      capture_version: capture,
      session_id: text(value.sessionId),
      source_id: source.id,
      sequence: source.sequence as number,
      occurred_at: value.occurredAt,
      elapsed_ms: typeof value.elapsedMs === "number" ? value.elapsedMs : null,
      challenge: text(value.challenge),
      challenge_revision: text(value.challengeRevision),
      attempt_id: text(value.attemptId),
      terms_version: text(value.termsVersion),
      payload: record.payload,
    },
  };
}

/**
 * Hex SHA-256 of a string, with Web Crypto where it exists. Pages served over plain HTTP from
 * a LAN address (development) are not secure contexts and have no `crypto.subtle`, so a
 * small implementation of FIPS 180-4 stands in there.
 */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = globalThis.crypto?.subtle
    ? new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
    : sha256(bytes);
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 in plain JavaScript, for where Web Crypto is missing. */
export function sha256(message: Uint8Array): Uint8Array {
  const length = message.length;
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(message);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 2 ** 32));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 =
        (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    const sum = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i++) h[i] = (h[i] + sum[i]) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  h.forEach((word, i) => outView.setUint32(i * 4, word));
  return out;
}
