/**
 * The ingest Worker: receives batches of practice records from browsers, checks them, and
 * writes one row per record to the events stream (Cloudflare Pipelines, which lands them as an
 * Iceberg table of Parquet files in R2). See docs/telemetry.md.
 *
 *   POST /ingest/v1/batches                          a batch (packages/domain/ingest.ts)
 *   POST /ingest/v1/participants/<id>/delete         { secret }: stop and erase a participant
 *   POST /ingest/v1/participants/<id>/access         { secret }: ask for a copy of their rows
 *
 * Bodies may be gzipped (header `x-mm-encoding: gzip`). Nothing here runs participant code.
 */
import {
  checkBatch,
  checkRecord,
  countryOf,
  sha256Hex,
  type EventRow,
} from "../../../packages/domain/ingest";
import { safeIdentifier } from "../../../packages/domain/capture";
import { advanceComparisonGeneration } from "./comparison-fence";
import { comparisonPrivacy } from "./comparison-privacy";

/** The parts of an R2 bucket this Worker uses. */
export interface Bucket {
  get(key: string): Promise<{ text(): Promise<string>; etag?: string } | null>;
  put(key: string, value: string, options?: { onlyIf: { etagMatches: string } | { etagDoesNotMatch: string } }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

/** A Workers rate limiting binding: approximate, counted per Cloudflare location. */
export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** A Pipelines stream binding. */
export interface Stream {
  send(rows: EventRow[]): Promise<void>;
}

export interface Env {
  /** The events stream; absent in local development, where rows go to CONTROL instead. */
  readonly EVENTS?: Stream;
  /** Participant proofs, deletion tombstones, access requests, and (locally) the rows themselves. */
  readonly CONTROL: Bucket;
  /** Draft only. No production variable enables this new write authority. */
  readonly COMPARISON_PRIVACY_ENABLED?: string;
  /** Origins allowed to call across origins (local development); comma-separated. */
  readonly ALLOWED_ORIGINS?: string;
  /**
   * Requests per participant (120 a minute; the uploader sends at most 60 while draining a
   * backlog), and per address before the body is read (600 a minute, generous because many
   * people can share one address). Absent in local development.
   */
  readonly PER_PARTICIPANT?: Limiter;
  readonly PER_ADDRESS?: Limiter;
}

/** The most bytes read from a request body, before and after decompression. */
const MAX_BODY_BYTES = 4_000_000;

/** Proofs seen by this isolate, so most batches cost no storage read. */
const proofs = new Map<string, string>();

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
};

export async function handle(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
    });
  try {
    if (request.method === "POST") {
      const address = request.headers.get("cf-connecting-ip") ?? "unknown";
      await within(env.PER_ADDRESS, `address:${address}`);
    }
    if (request.method === "POST" && path === "/ingest/v1/batches")
      return await batches(request, env, reply);
    const deletion = /^\/ingest\/v1\/participants\/([^/]+)\/delete$/.exec(path);
    if (request.method === "POST" && deletion)
      return await erase(request, env, decodeURIComponent(deletion[1]), reply);
    const access = /^\/ingest\/v1\/participants\/([^/]+)\/access$/.exec(path);
    if (request.method === "POST" && access)
      return await requestAccess(request, env, decodeURIComponent(access[1]), reply);
    const privacy = /^\/ingest\/v1\/participants\/([^/]+)\/comparison-privacy$/.exec(path);
    if (request.method === "POST" && privacy && env.COMPARISON_PRIVACY_ENABLED === "true") {
      let input: unknown;
      try { input = JSON.parse(await body(request)); } catch { return reply(400, { error: "Malformed request." }); }
      const result = await comparisonPrivacy(env, decodeURIComponent(privacy[1]), input);
      return reply(result.status, result.body);
    }
    return reply(404, { error: "Not found." });
  } catch (cause) {
    if (cause instanceof Refusal)
      return new Response(JSON.stringify({ error: cause.message }), {
        status: cause.status,
        headers: {
          ...cors,
          "content-type": "application/json",
          "cache-control": "no-store",
          ...(cause.status === 429 ? { "retry-after": "60" } : {}),
        },
      });
    // Storage errors can include keys or request values. Keep logs code/secret-free.
    console.error("ingest failed");
    // The device keeps the records and retries later.
    return reply(503, { error: "Try again later." });
  }
}

class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function batches(
  request: Request,
  env: Env,
  reply: (status: number, body: unknown) => Response,
): Promise<Response> {
  let batch;
  try {
    batch = checkBatch(JSON.parse(await body(request)));
  } catch (cause) {
    if (cause instanceof Refusal) throw cause;
    throw new Refusal(400, cause instanceof Error ? cause.message : "Malformed batch.");
  }
  const { participantId, proof } = batch;
  await within(env.PER_PARTICIPANT, `participant:${participantId}`);
  if (await env.CONTROL.get(`deleted/${participantId}`))
    throw new Refusal(410, "This participant's data was deleted.");
  await claim(env, participantId, proof);

  const receivedAt = new Date().toISOString();
  // Where Cloudflare places the connection, as a country only; the IP address is not kept.
  const country = countryOf((request as { cf?: { country?: unknown } }).cf?.country);
  const rows: EventRow[] = [];
  const rejected: { recordId: string; reason: string }[] = [];
  for (const record of batch.records) {
    const verdict = checkRecord(record, participantId, receivedAt, country);
    if (verdict.ok) rows.push(verdict.row);
    else rejected.push({ recordId: verdict.recordId, reason: verdict.reason });
  }
  if (rows.length) {
    if (env.EVENTS) await env.EVENTS.send(rows);
    else
      // Local development: the stream does not exist, so keep the rows where they can be read.
      await env.CONTROL.put(
        `dev-events/${receivedAt.slice(0, 10)}/${participantId}/${crypto.randomUUID()}.ndjson`,
        rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
      );
  }
  return reply(200, { accepted: rows.length, rejected });
}

/**
 * The first proof seen for a participant ID becomes its owner's; any other is refused. Two
 * first batches racing could both pass the read, but only from devices that both made the
 * same random ID, which does not happen.
 */
async function claim(env: Env, participantId: string, proof: string): Promise<void> {
  let known = proofs.get(participantId);
  if (!known) {
    const stored = await env.CONTROL.get(`participants/${participantId}`);
    if (stored) known = JSON.parse(await stored.text()).proof as string;
    else {
      await env.CONTROL.put(
        `participants/${participantId}`,
        JSON.stringify({ proof, since: new Date().toISOString() }),
      );
      known = proof;
    }
    proofs.set(participantId, known);
  }
  if (known !== proof) throw new Refusal(401, "This participant ID belongs to another device.");
}

/**
 * Deletion, with the device secret as proof: a tombstone stops further uploads at once, and
 * the erasure job removes the participant's rows from the events table (docs/telemetry.md).
 */
async function erase(
  request: Request,
  env: Env,
  participantId: string,
  reply: (status: number, body: unknown) => Response,
): Promise<Response> {
  // Nothing was ever uploaded (or the proof is already gone): there is nothing to erase.
  if (!(await owned(request, env, participantId))) return reply(200, { deleted: true, uploaded: false });
  if (!(await env.CONTROL.get(`deleted/${participantId}`)))
    await env.CONTROL.put(
      `deleted/${participantId}`,
      JSON.stringify({ requestedAt: new Date().toISOString() }),
    );
  // Keep the proof until invalidation succeeds, so an interrupted deletion remains retryable.
  if (env.COMPARISON_PRIVACY_ENABLED === "true") {
    await advanceComparisonGeneration(env);
    await env.CONTROL.delete(`comparison-privacy/${participantId}`);
  }
  // The tombstone refuses uploads from now on, so the proof has no use left.
  await env.CONTROL.delete(`participants/${participantId}`);
  proofs.delete(participantId);
  return reply(200, { deleted: true, uploaded: true });
}

/**
 * An access request, with the device secret as proof: notes it under a short reference the
 * person emails us, and the operator answers with a copy of their rows (docs/telemetry.md).
 */
async function requestAccess(
  request: Request,
  env: Env,
  participantId: string,
  reply: (status: number, body: unknown) => Response,
): Promise<Response> {
  const proven = await owned(request, env, participantId);
  if (await env.CONTROL.get(`deleted/${participantId}`))
    throw new Refusal(410, "This participant's data was deleted.");
  if (!proven) return reply(200, { uploaded: false });
  const reference = referenceCode();
  await env.CONTROL.put(
    `access/${reference}.json`,
    JSON.stringify({ participantId, requestedAt: new Date().toISOString() }),
  );
  return reply(200, { uploaded: true, reference });
}

/**
 * Whether the request's secret proves this participant ID: false when nothing was ever
 * uploaded under it, so there is no proof to check against. Refuses a malformed request or a
 * wrong secret.
 */
async function owned(request: Request, env: Env, participantId: string): Promise<boolean> {
  try {
    safeIdentifier(participantId);
  } catch {
    throw new Refusal(400, "Unknown participant.");
  }
  await within(env.PER_PARTICIPANT, `participant:${participantId}`);
  let secret: unknown;
  try {
    secret = JSON.parse(await body(request)).secret;
  } catch {
    throw new Refusal(400, "Malformed request.");
  }
  if (typeof secret !== "string" || secret.length < 32) throw new Refusal(400, "No secret.");
  const stored = await env.CONTROL.get(`participants/${participantId}`);
  if (!stored) return false;
  const { proof } = JSON.parse(await stored.text()) as { proof: string };
  if ((await sha256Hex(secret)) !== proof) throw new Refusal(401, "Wrong secret.");
  return true;
}

/** A short random reference for an access request, easy to read out: MM-XXXX-XXXX. */
function referenceCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  return `MM-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Refuses the request (429) when this key is over its limit. */
async function within(limiter: Limiter | undefined, key: string): Promise<void> {
  if (limiter && !(await limiter.limit({ key })).success)
    throw new Refusal(429, "Too many requests. Try again in a minute.");
}

/** The request body as text, gunzipped when marked, refusing anything too large. */
async function body(request: Request): Promise<string> {
  if (!request.body) return "";
  let stream: ReadableStream<Uint8Array> = request.body;
  if (request.headers.get("x-mm-encoding") === "gzip")
    stream = stream.pipeThrough(new DecompressionStream("gzip") as never);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) throw new Refusal(413, "The batch is too large.");
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-mm-encoding",
    "access-control-max-age": "600",
    vary: "origin",
  };
}
