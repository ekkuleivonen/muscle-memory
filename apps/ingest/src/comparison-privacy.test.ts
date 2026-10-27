import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "../../../packages/domain/ingest";
import {
  comparisonPrivacy,
  checkComparisonMembers,
} from "./comparison-privacy";
import { handle, type Env } from "./index";
const id = "synthetic-browser",
  secret = "synthetic-original-device-secret-only";
async function fixture() {
  const objects = new Map<string, { value: string; etag: string }>();
  let serial = 0;
  const set = (key: string, value: unknown) =>
    objects.set(key, { value: JSON.stringify(value), etag: String(++serial) });
  set(`participants/${id}`, { proof: await sha256Hex(secret) });
  const env: Env = {
    CONTROL: {
      get: async (key) => {
        const s = objects.get(key);
        return s ? { text: async () => s.value, etag: s.etag } : null;
      },
      put: async (key, value, options) => {
        const current = objects.get(key);
        const condition = options?.onlyIf;
        if (
          condition &&
          ("etagMatches" in condition
            ? current?.etag !== condition.etagMatches
            : !!current)
        )
          return null;
        objects.set(key, { value, etag: String(++serial) });
        return { etag: String(serial) };
      },
      delete: async (key) => {
        objects.delete(key);
      },
    },
  };
  const update = (
    expectedRevision: unknown = null,
    stealth = false,
    age = "adult",
  ) =>
    comparisonPrivacy(env, id, {
      secret,
      action: "update",
      expectedRevision,
      stealth,
      age,
    });
  return { env, objects, set, update };
}
test("privacy requires original secret; disabled public path and arbitrary methods/paths stay closed", async () => {
  const { env, objects } = await fixture();
  for (const bad of ["", await sha256Hex(secret), "x".repeat(257)]) {
    const r = await comparisonPrivacy(env, id, {
      secret: bad,
      action: "update",
      expectedRevision: null,
      stealth: false,
      age: "adult",
    });
    assert.equal(r.status, 401);
  }
  assert.equal(objects.size, 1);
  for (const [method, path] of [
    ["POST", `${id}/comparison-privacy`],
    ["GET", `${id}/comparison-privacy`],
    ["POST", `${id}/eligible`],
    ["POST", "../comparison-privacy"],
  ]) {
    assert.equal(
      (
        await handle(
          new Request(
            `https://example.invalid/ingest/v1/participants/${path}`,
            { method },
          ),
          env,
        )
      ).status,
      404,
    );
  }
});
test("conditional writes reject stale and racing requests, telemetry cannot restore eligibility", async () => {
  const { env, update, objects } = await fixture();
  const first = await update();
  assert.equal(first.status, 200);
  const revision = (first.body.value as { revision: string }).revision;
  const raced = await Promise.all([
    update(revision, true),
    update(revision, true),
  ]);
  assert.deepEqual(raced.map((r) => r.status).sort(), [200, 409]);
  assert.deepEqual(await checkComparisonMembers(env, [id]), [null]);
  assert.equal((await update(revision, false)).status, 409);
  assert.ok(!JSON.stringify([...objects.values()]).includes(secret));
});
test("missing, unknown, minors, stealth and deletion fail closed, including deletion during lookup", async () => {
  const { env, update, set, objects } = await fixture();
  assert.deepEqual(await checkComparisonMembers(env, [id]), [null]);
  let r = await update();
  assert.deepEqual(await checkComparisonMembers(env, [id]), [
    (r.body.value as { revision: string }).revision,
  ]);
  for (const age of ["unknown", "non-adult"]) {
    r = await update(
      (r.body.value as { revision: string }).revision,
      false,
      age,
    );
    assert.deepEqual(await checkComparisonMembers(env, [id]), [null]);
  }
  r = await update((r.body.value as { revision: string }).revision);
  const get = env.CONTROL.get;
  env.CONTROL.get = async (key) => {
    const result = await get(key);
    if (key.startsWith("comparison-privacy/")) set(`deleted/${id}`, {});
    return result;
  };
  assert.deepEqual(await checkComparisonMembers(env, [id]), [null]);
  assert.equal(
    (await update((r.body.value as { revision: string }).revision)).status,
    401,
  );
  objects.delete(`participants/${id}`);
  assert.deepEqual(await checkComparisonMembers(env, [id]), [null]);
});
test("invalid IDs, duplicate members, excess members and control failures never become eligibility", async () => {
  const { env } = await fixture();
  for (const members of [
    ["../proof"],
    [id, id],
    Array.from({ length: 101 }, (_, i) => `b${i}`),
    [42],
    {},
  ])
    await assert.rejects(() => checkComparisonMembers(env, members));
  env.CONTROL.get = async () => {
    throw new Error("private-storage-detail");
  };
  await assert.rejects(() => checkComparisonMembers(env, [id]));
});
