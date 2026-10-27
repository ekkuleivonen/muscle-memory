import { test } from "node:test";
import assert from "node:assert/strict";
import { canonical, type Json } from "../../../packages/domain/json";
import { codeRevision, toRecord, type StoredRecord } from "../../../packages/domain/records";
import { PRACTICE_CAPTURE_VERSION } from "../../../packages/domain/practice";
import { SITE_CAPTURE_VERSION } from "../../../packages/domain/site";
import { INGEST_PROTOCOL, sha256Hex, type EventRow } from "../../../packages/domain/ingest";
import { handle, type Env } from "./index";
import { countryOf } from "../../../packages/domain/ingest";

function fakes() {
  const objects = new Map<string, string>();
  const sent: EventRow[] = [];
  const env: Env = {
    CONTROL: {
      get: async (key) => {
        const value = objects.get(key);
        return value === undefined ? null : { text: async () => value };
      },
      put: async (key, value) => void objects.set(key, value),
      delete: async (key) => void objects.delete(key),
    },
    EVENTS: { send: async (rows) => void sent.push(...rows) },
    ALLOWED_ORIGINS: "http://localhost:3000",
  };
  return { env, objects, sent };
}

let participantN = 0;
async function device() {
  const participantId = `p${++participantN}x${Date.now()}`;
  const secret = "s".repeat(40) + participantN;
  return { participantId, secret, proof: await sha256Hex(secret) };
}

function observation(participantId: string, sequence: number, extra: Record<string, unknown> = {}): StoredRecord {
  const value = {
    schemaVersion: "1.0.0",
    type: "practice.keys",
    observationId: `practice-a.${sequence}`,
    participantId,
    sessionId: "session-a",
    source: { id: "practice-a", sequence },
    occurredAt: "2026-10-25T10:00:00.000Z",
    elapsedMs: 12.5 * sequence,
    captureVersion: PRACTICE_CAPTURE_VERSION,
    termsVersion: "2026-10-25",
    assignments: {},
    challenge: "PY-002",
    challengeRevision: "sha256:" + "a".repeat(64),
    attemptId: "attempt-a",
    data: { file: "x.py", keys: [[1, "down", "a", "KeyA", "", false]] },
    ...extra,
  };
  return {
    recordId: String(value.observationId),
    kind: "observation",
    participantId,
    payload: canonical(value as unknown as Json),
  };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://musclememory.run${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: (typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body)) as BodyInit,
  });

test("a batch becomes one row per record, the payload kept verbatim", async () => {
  const { env, sent } = fakes();
  const me = await device();
  const records = [
    observation(me.participantId, 1),
    toRecord(codeRevision(me.participantId, "practice-a", 0, PRACTICE_CAPTURE_VERSION, { "x.py": { text: "x = 1\n", mediaType: "text/x-python" } })),
    // Refused: another person's record, and a capture version nobody released.
    observation("someone-else", 2),
    observation(me.participantId, 3, { captureVersion: "practice-capture-0.9.0" }),
    // A site record carries the site stream's version, not the practice one.
    observation(me.participantId, 4, { type: "site.page", captureVersion: PRACTICE_CAPTURE_VERSION }),
    observation(me.participantId, 5, { type: "site.page", captureVersion: SITE_CAPTURE_VERSION, challenge: null, challengeRevision: null, attemptId: null, data: { visible: true, focused: true, width: 1, height: 1 } }),
  ];
  const response = await handle(
    post("/ingest/v1/batches", { protocol: INGEST_PROTOCOL, participantId: me.participantId, proof: me.proof, records }),
    env,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.accepted, 3);
  assert.deepEqual(
    body.rejected.map((r: { reason: string }) => r.reason),
    ["another participant", "unknown capture version", "unknown capture version"],
  );
  assert.deepEqual(
    sent.map((r) => [r.kind, r.type, r.sequence, r.elapsed_ms, r.challenge, r.attempt_id, r.session_id, r.terms_version]),
    [
      ["observation", "practice.keys", 1, 12.5, "PY-002", "attempt-a", "session-a", "2026-10-25"],
      ["artifact", "artifact.code-revision", null, null, null, null, null, null],
      ["observation", "site.page", 5, 62.5, null, null, "session-a", "2026-10-25"],
    ],
  );
  assert.equal(sent[0].payload, records[0].payload);
  assert.ok(Date.parse(sent[0].received_at) > 0);
  // No country known (a request outside Cloudflare): null, never guessed.
  assert.equal(sent[0].country, null);
});

test("rows carry the country Cloudflare places the upload in, and never the IP address", async () => {
  const { env, sent } = fakes();
  const me = await device();
  const request = post(
    "/ingest/v1/batches",
    { protocol: INGEST_PROTOCOL, participantId: me.participantId, proof: me.proof, records: [observation(me.participantId, 1)] },
    { "cf-connecting-ip": "203.0.113.7" },
  );
  Object.defineProperty(request, "cf", { value: { country: "FI", city: "Helsinki" } });
  assert.equal((await handle(request, env)).status, 200);
  assert.equal(sent[0].country, "FI");
  assert.ok(!JSON.stringify(sent).includes("203.0.113.7"));
  assert.ok(!JSON.stringify(sent).includes("Helsinki"));
  assert.deepEqual(["FI", "XX", "T1", "fi", 7].map(countryOf), ["FI", null, null, null, null]);
});

test("gzipped bodies are read; a participant ID belongs to the device that first used it", async () => {
  const { env, sent } = fakes();
  const me = await device();
  const batch = { protocol: INGEST_PROTOCOL, participantId: me.participantId, proof: me.proof, records: [observation(me.participantId, 1)] };
  const gzipped = new Uint8Array(
    await new Response(
      new Blob([JSON.stringify(batch)]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );
  assert.equal((await handle(post("/ingest/v1/batches", gzipped, { "x-mm-encoding": "gzip" }), env)).status, 200);
  assert.equal(sent.length, 1);
  const other = await device();
  const stolen = await handle(
    post("/ingest/v1/batches", { ...batch, proof: other.proof }),
    env,
  );
  assert.equal(stolen.status, 401);
  assert.equal(sent.length, 1);
});

test("deleting needs the device secret, stops uploads, and leaves a tombstone for the erasure job", async () => {
  const { env, objects } = fakes();
  const me = await device();
  const batch = { protocol: INGEST_PROTOCOL, participantId: me.participantId, proof: me.proof, records: [observation(me.participantId, 1)] };
  await handle(post("/ingest/v1/batches", batch), env);
  const path = `/ingest/v1/participants/${me.participantId}/delete`;
  assert.equal((await handle(post(path, { secret: "w".repeat(40) }), env)).status, 401);
  const done = await handle(post(path, { secret: me.secret }), env);
  assert.deepEqual(await done.json(), { deleted: true, uploaded: true });
  assert.ok(objects.has(`deleted/${me.participantId}`));
  // The tombstone refuses uploads now, so the proof is not kept.
  assert.ok(!objects.has(`participants/${me.participantId}`));
  assert.equal((await handle(post("/ingest/v1/batches", batch), env)).status, 410);
  assert.ok(!objects.has(`participants/${me.participantId}`));
  // A device that never uploaded has nothing to erase.
  const never = await device();
  const nothing = await handle(post(`/ingest/v1/participants/${never.participantId}/delete`, { secret: never.secret }), env);
  assert.deepEqual(await nothing.json(), { deleted: true, uploaded: false });
});

test("an access request needs the device secret and leaves a reference for the operator", async () => {
  const { env, objects } = fakes();
  const me = await device();
  const batch = { protocol: INGEST_PROTOCOL, participantId: me.participantId, proof: me.proof, records: [observation(me.participantId, 1)] };
  await handle(post("/ingest/v1/batches", batch), env);
  const path = `/ingest/v1/participants/${me.participantId}/access`;
  assert.equal((await handle(post(path, { secret: "w".repeat(40) }), env)).status, 401);
  assert.equal((await handle(post(path, {}), env)).status, 400);
  const asked = await handle(post(path, { secret: me.secret }), env);
  const { uploaded, reference } = (await asked.json()) as { uploaded: boolean; reference: string };
  assert.equal(uploaded, true);
  assert.match(reference, /^MM-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const note = JSON.parse(objects.get(`access/${reference}.json`)!);
  assert.equal(note.participantId, me.participantId);
  // A device that never uploaded has nothing on the server to ask for.
  const never = await device();
  const nothing = await handle(post(`/ingest/v1/participants/${never.participantId}/access`, { secret: never.secret }), env);
  assert.deepEqual(await nothing.json(), { uploaded: false });
  // After deleting, there is nothing left to ask for.
  await handle(post(`/ingest/v1/participants/${me.participantId}/delete`, { secret: me.secret }), env);
  assert.equal((await handle(post(path, { secret: me.secret }), env)).status, 410);
});

test("malformed and oversized requests are refused; CORS only for listed origins", async () => {
  const { env } = fakes();
  assert.equal((await handle(post("/ingest/v1/batches", "not json"), env)).status, 400);
  assert.equal((await handle(post("/ingest/v1/batches", { protocol: "other" }), env)).status, 400);
  assert.equal((await handle(post("/ingest/v1/batches", "x".repeat(4_100_000)), env)).status, 413);
  assert.equal((await handle(new Request("https://musclememory.run/ingest/v1/nope"), env)).status, 404);
  const preflight = (origin: string) =>
    handle(new Request("https://musclememory.run/ingest/v1/batches", { method: "OPTIONS", headers: { origin } }), env);
  assert.equal((await preflight("http://localhost:3000")).headers.get("access-control-allow-origin"), "http://localhost:3000");
  assert.equal((await preflight("https://evil.example")).headers.get("access-control-allow-origin"), null);
});

test("without a stream (local development) rows land in the control bucket", async () => {
  const { env, objects } = fakes();
  const local: Env = { CONTROL: env.CONTROL };
  const me = await device();
  await handle(
    post("/ingest/v1/batches", { protocol: INGEST_PROTOCOL, participantId: me.participantId, proof: me.proof, records: [observation(me.participantId, 1)] }),
    local,
  );
  const [key] = [...objects.keys()].filter((k) => k.startsWith("dev-events/"));
  assert.ok(key);
  assert.equal(JSON.parse(objects.get(key)!.trim()).record_id, "practice-a.1");
});

test("too many requests from one participant or one address get 429, and the device keeps its records", async () => {
  const { env, sent } = fakes();
  const counts = new Map<string, number>();
  const limiter = (max: number) => ({
    limit: async ({ key }: { key: string }) => {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return { success: counts.get(key)! <= max };
    },
  });
  const limited: Env = { ...env, PER_PARTICIPANT: limiter(2), PER_ADDRESS: limiter(4) };
  const me = await device();
  const batch = { protocol: INGEST_PROTOCOL, participantId: me.participantId, proof: me.proof, records: [observation(me.participantId, 1)] };
  const statuses = [];
  for (let i = 0; i < 3; i++)
    statuses.push((await handle(post("/ingest/v1/batches", batch, { "cf-connecting-ip": "203.0.113.7" }), limited)).status);
  assert.deepEqual(statuses, [200, 200, 429]);
  assert.equal(sent.length, 2);
  // Another participant behind the same address still gets through, until the address limit.
  const other = await device();
  const theirs = { ...batch, participantId: other.participantId, proof: other.proof, records: [observation(other.participantId, 1)] };
  const fourth = await handle(post("/ingest/v1/batches", theirs, { "cf-connecting-ip": "203.0.113.7" }), limited);
  assert.equal(fourth.status, 200);
  const fifth = await handle(post("/ingest/v1/batches", theirs, { "cf-connecting-ip": "203.0.113.7" }), limited);
  assert.equal(fifth.status, 429);
  assert.equal(fifth.headers.get("retry-after"), "60");
});
