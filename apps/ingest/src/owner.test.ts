import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyOwner } from "./owner";
import { sha256Hex } from "../../../packages/domain/ingest";
import type { Env } from "./index";
const participant = "synthetic-owner",
  secret = "synthetic-owner-private-secret-for-test-only";
async function fake() {
  const objects = new Map<string, string>([
    [
      `participants/${participant}`,
      JSON.stringify({ proof: await sha256Hex(secret) }),
    ],
  ]);
  const reads: string[] = [];
  const env: Env = {
    CONTROL: {
      get: async (key) => {
        reads.push(key);
        const s = objects.get(key);
        return s ? { text: async () => s } : null;
      },
      put: async () => assert.fail("verification must not write"),
      delete: async () => assert.fail("verification must not delete"),
    },
  };
  return { env, objects, reads };
}
test("RPC verifies fresh original secret, never an upload hash or ID, and is read-only", async () => {
  const { env, objects, reads } = await fake();
  assert.equal(await verifyOwner(env, participant, secret), "owned");
  assert.equal(reads.filter((k) => k.startsWith("deleted/")).length, 2);
  assert.equal(
    await verifyOwner(env, participant, await sha256Hex(secret)),
    "denied",
  );
  assert.equal(await verifyOwner(env, participant, ""), "denied");
  assert.equal(await verifyOwner(env, "another-participant", secret), "absent");
  objects.set(
    `participants/${participant}`,
    JSON.stringify({
      proof: await sha256Hex("changed-secret-that-is-long-enough"),
    }),
  );
  assert.equal(await verifyOwner(env, participant, secret), "denied");
});
test("deletion tombstone wins before or during proof reading; no proof cache", async () => {
  const { env, objects } = await fake();
  const get = env.CONTROL.get;
  env.CONTROL.get = async (key) => {
    const value = await get(key);
    if (key.startsWith("participants/"))
      objects.set(`deleted/${participant}`, "{}");
    return value;
  };
  assert.equal(await verifyOwner(env, participant, secret), "deleted");
  objects.delete(`participants/${participant}`);
  assert.equal(await verifyOwner(env, participant, secret), "deleted");
});
test("malformed IDs, long secrets and rate limits do not reach proof storage", async () => {
  const { env, reads } = await fake();
  assert.equal(await verifyOwner(env, "../x", secret), "denied");
  assert.equal(await verifyOwner(env, participant, "x".repeat(257)), "denied");
  const limited = {
    ...env,
    PER_PARTICIPANT: { limit: async () => ({ success: false }) },
  };
  assert.equal(await verifyOwner(limited, participant, secret), "denied");
  assert.equal(reads.length, 0);
});
