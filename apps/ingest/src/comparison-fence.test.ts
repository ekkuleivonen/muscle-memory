import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advanceComparisonGeneration,
  authorizeComparisonGeneration,
  comparisonGeneration,
} from "./comparison-fence";
import {
  comparisonPrivacy,
  checkComparisonMembers,
} from "./comparison-privacy";
import { handle, type Env } from "./index";
import { sha256Hex } from "../../../packages/domain/ingest";
const fence = "comparison-publication/fence",
  id = "synthetic-fence-owner",
  secret = "synthetic-fence-original-device-secret";
async function fixture() {
  let serial = 0;
  const objects = new Map<string, { text: string; etag: string }>();
  const set = (key: string, value: unknown) =>
    objects.set(key, { text: JSON.stringify(value), etag: String(++serial) });
  set(`participants/${id}`, { proof: await sha256Hex(secret) });
  const env: Env = {
    COMPARISON_PRIVACY_ENABLED: "true",
    CONTROL: {
      get: async (key) => {
        const value = objects.get(key);
        return value
          ? { text: async () => value.text, etag: value.etag }
          : null;
      },
      put: async (key, text, options) => {
        const current = objects.get(key),
          condition = options?.onlyIf;
        if (
          condition &&
          ("etagMatches" in condition
            ? current?.etag !== condition.etagMatches
            : !!current)
        )
          return null;
        const etag = String(++serial);
        objects.set(key, { text, etag });
        return { etag };
      },
      delete: async (key) => {
        objects.delete(key);
      },
    },
  };
  const update = async (
    expectedRevision: string | null,
    stealth = false,
    age = "adult",
  ) =>
    comparisonPrivacy(env, id, {
      action: "update",
      secret,
      expectedRevision,
      stealth,
      age,
    });
  const read = () => comparisonPrivacy(env, id, { action: "read", secret });
  return { env, objects, set, update, read };
}
test("an invalidation acknowledged before the authorizing read always wins; one after it only affects later reads", async () => {
  const { env } = await fixture();
  const old = await advanceComparisonGeneration(env);
  const get = env.CONTROL.get;
  // The invalidation lands just before the authorizing read reaches storage.
  let invalidate = true;
  env.CONTROL.get = async (key, ...rest) => {
    if (key === fence && invalidate) {
      invalidate = false;
      await advanceComparisonGeneration(env);
    }
    return get(key, ...rest);
  };
  assert.equal(await authorizeComparisonGeneration(env, old), false);
  env.CONTROL.get = get;
  // Authorized first, invalidated after: that earlier authorization may be delivered, nothing newer.
  const current = await comparisonGeneration(env);
  assert.equal(await authorizeComparisonGeneration(env, current), true);
  await advanceComparisonGeneration(env);
  assert.equal(await authorizeComparisonGeneration(env, current), false);
});
test("invalidation retries an overlapping authorization without losing the mutation; bounded CAS failure fails closed", async () => {
  const { env } = await fixture();
  const old = await advanceComparisonGeneration(env);
  const put = env.CONTROL.put;
  let authorize = true;
  env.CONTROL.put = async (key, text, options) => {
    if (key === fence && authorize && JSON.parse(text).generation !== old) {
      authorize = false;
      assert.equal(await authorizeComparisonGeneration(env, old), true);
    }
    return put(key, text, options);
  };
  const next = await advanceComparisonGeneration(env);
  assert.notEqual(next, old);
  assert.equal(await authorizeComparisonGeneration(env, old), false);
  let writes = 0;
  env.CONTROL.put = async () => {
    writes++;
    return null;
  };
  await assert.rejects(() => advanceComparisonGeneration(env));
  assert.equal(writes, 3);
  // A failed invalidation leaves the last acknowledged generation current: reading authorizes it
  // without writing, so public reads never compete with privacy changes or deletion.
  writes = 0;
  assert.equal(await authorizeComparisonGeneration(env, next), true);
  assert.equal(await authorizeComparisonGeneration(env, old), false);
  assert.equal(writes, 0);
});
test("authorization is a read: it never writes the fence and never blocks an invalidation", async () => {
  const { env } = await fixture();
  const old = await advanceComparisonGeneration(env);
  const put = env.CONTROL.put;
  let writes = 0;
  env.CONTROL.put = async (key, text, options) => {
    writes++;
    return put(key, text, options);
  };
  for (let i = 0; i < 50; i++)
    assert.equal(await authorizeComparisonGeneration(env, old), true);
  assert.equal(writes, 0);
  const next = await advanceComparisonGeneration(env);
  assert.equal(writes, 1, "one write, no retries caused by reads");
  assert.equal(await authorizeComparisonGeneration(env, old), false);
  assert.equal(await authorizeComparisonGeneration(env, next), true);
});
test("every acknowledged permissive/restrictive/age change invalidates the prior generation", async () => {
  const { env, update } = await fixture();
  let revision: string | null = null;
  for (const [stealth, age] of [
    [false, "adult"],
    [true, "adult"],
    [false, "adult"],
    [false, "unknown"],
    [false, "non-adult"],
    [false, "adult"],
  ] as const) {
    const before = await comparisonGeneration(env);
    const result = await update(revision, stealth, age);
    assert.equal(result.status, 200);
    revision = (result.body.value as { revision: string }).revision;
    const after = await comparisonGeneration(env);
    assert.ok(after);
    assert.notEqual(after, before);
    if (before)
      assert.equal(await authorizeComparisonGeneration(env, before), false);
    assert.equal(await authorizeComparisonGeneration(env, after), true);
  }
});
test("privacy partial write cannot confirm or qualify, and explicit revision retry recovers", async () => {
  const { env, update, read } = await fixture();
  const first = await update(null);
  const revision = (first.body.value as { revision: string }).revision;
  const old = await comparisonGeneration(env);
  const put = env.CONTROL.put;
  env.CONTROL.put = async (key, text, options) => {
    if (key === fence) throw new Error("synthetic control failure");
    return put(key, text, options);
  };
  await assert.rejects(() => update(revision, true));
  const pending = await read();
  assert.equal(pending.status, 202);
  assert.deepEqual(await checkComparisonMembers(env, [id]), [null]);
  env.CONTROL.put = put;
  const retry = await update(
    (pending.body.value as { revision: string }).revision,
    true,
  );
  assert.equal(retry.status, 200);
  assert.equal(await authorizeComparisonGeneration(env, old), false);
  assert.equal((await read()).status, 200);
});
test("deletion retains original proof across failed invalidation; retry acknowledges only after the old generation is invalid", async () => {
  const { env, objects, update } = await fixture();
  await update(null);
  const old = await comparisonGeneration(env);
  const put = env.CONTROL.put;
  env.CONTROL.put = async (key, text, options) =>
    key === fence ? null : put(key, text, options);
  const request = () =>
    new Request(`https://example.invalid/ingest/v1/participants/${id}/delete`, {
      method: "POST",
      body: JSON.stringify({ secret }),
    });
  assert.equal((await handle(request(), env)).status, 503);
  assert.ok(objects.has(`deleted/${id}`));
  assert.ok(objects.has(`participants/${id}`));
  env.CONTROL.put = put;
  assert.equal((await handle(request(), env)).status, 200);
  assert.equal(await authorizeComparisonGeneration(env, old), false);
  assert.ok(!objects.has(`participants/${id}`));
  assert.ok(!objects.has(`comparison-privacy/${id}`));
});
test("missing, malformed and unavailable control never authorizes", async () => {
  const { env, set } = await fixture();
  assert.equal(await comparisonGeneration(env), null);
  assert.equal(await authorizeComparisonGeneration(env, "../../proof"), false);
  set(fence, { generation: "bad", authorizationNonce: "bad" });
  await assert.rejects(() => comparisonGeneration(env));
  await assert.rejects(() =>
    authorizeComparisonGeneration(env, crypto.randomUUID()),
  );
});
for (const failFirst of [false, true])
  test(`enabled → disabled deletion → re-enabled cannot authorize a cached generation; failed-write retry=${failFirst}`, async () => {
    const { env, objects, update } = await fixture();
    assert.equal((await update(null)).status, 200);
    const cachedGeneration = await comparisonGeneration(env);
    assert.equal(
      await authorizeComparisonGeneration(env, cachedGeneration),
      true,
    );
    assert.ok((await checkComparisonMembers(env, [id]))[0]);
    const disabled = { ...env, COMPARISON_PRIVACY_ENABLED: "false" };
    const request = () =>
      new Request(
        `https://example.invalid/ingest/v1/participants/${id}/delete`,
        {
          method: "POST",
          body: JSON.stringify({ secret }),
        },
      );
    if (failFirst) {
      const put = env.CONTROL.put;
      env.CONTROL.put = async (key, text, options) =>
        key === fence ? null : put(key, text, options);
      assert.equal((await handle(request(), disabled)).status, 503);
      assert.ok(objects.has(`deleted/${id}`));
      assert.ok(
        objects.has(`participants/${id}`),
        "failure keeps ownership proof for retry even while disabled",
      );
      env.CONTROL.put = put;
    }
    assert.equal((await handle(request(), disabled)).status, 200);
    assert.notEqual(await comparisonGeneration(env), cachedGeneration);
    assert.ok(!objects.has(`participants/${id}`));
    assert.ok(!objects.has(`comparison-privacy/${id}`));
    const reenabled = { ...disabled, COMPARISON_PRIVACY_ENABLED: "true" };
    assert.equal(
      await authorizeComparisonGeneration(reenabled, cachedGeneration),
      false,
    );
    assert.deepEqual(await checkComparisonMembers(reenabled, [id]), [null]);
  });
test("failed finalization leaves old generation invalid and state pending; superseding update cannot be acknowledged as the earlier preference", async () => {
  const { env, objects, update, read } = await fixture();
  const first = await update(null);
  const revision = (first.body.value as { revision: string }).revision,
    old = await comparisonGeneration(env);
  const put = env.CONTROL.put;
  let fail = true;
  env.CONTROL.put = async (key, text, options) => {
    if (
      key === `comparison-privacy/${id}` &&
      JSON.parse(text).acknowledged &&
      fail
    ) {
      fail = false;
      return null;
    }
    return put(key, text, options);
  };
  assert.equal((await update(revision, true)).status, 409);
  assert.equal(await authorizeComparisonGeneration(env, old), false);
  const pending = await read();
  assert.equal(pending.status, 202);
  let supersede = true,
    winner = 0;
  env.CONTROL.put = async (key, text, options) => {
    if (
      key === `comparison-privacy/${id}` &&
      JSON.parse(text).acknowledged &&
      supersede
    ) {
      supersede = false;
      const current = JSON.parse(objects.get(key)!.text);
      winner = (await update(current.revision, true)).status;
    }
    return put(key, text, options);
  };
  assert.equal(
    (await update((pending.body.value as { revision: string }).revision, false))
      .status,
    409,
  );
  assert.equal(winner, 200);
  assert.deepEqual(await checkComparisonMembers(env, [id]), [null]);
});
test("accepted delayed telemetry cannot overwrite acknowledged current stealth or its generation", async () => {
  const { env, update } = await fixture();
  await update(null, true);
  const before = await comparisonGeneration(env);
  const { canonical } = await import("../../../packages/domain/json");
  const { SITE_CAPTURE_VERSION } = await import(
    "../../../packages/domain/site"
  );
  const { INGEST_PROTOCOL } = await import("../../../packages/domain/ingest");
  const payload = {
    schemaVersion: "1.0.0",
    type: "site.profile",
    observationId: "synthetic-old-profile.1",
    participantId: id,
    sessionId: "synthetic-old-site",
    source: { id: "synthetic-old-site", sequence: 1 },
    occurredAt: "2026-10-01T00:00:00.000Z",
    elapsedMs: 1,
    captureVersion: SITE_CAPTURE_VERSION,
    actor: "person",
    termsVersion: "2026-10-27.1",
    assignments: {},
    challenge: null,
    challengeRevision: null,
    attemptId: null,
    data: { from: "settings", answers: { stealth: false, age: "25-34" } },
  };
  const response = await handle(
    new Request("https://example.invalid/ingest/v1/batches", {
      method: "POST",
      body: JSON.stringify({
        protocol: INGEST_PROTOCOL,
        participantId: id,
        proof: await sha256Hex(secret),
        records: [
          {
            recordId: payload.observationId,
            kind: "observation",
            participantId: id,
            payload: canonical(payload),
          },
        ],
      }),
    }),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).accepted, 1);
  assert.equal(await comparisonGeneration(env), before);
  assert.deepEqual(await checkComparisonMembers(env, [id]), [null]);
});
