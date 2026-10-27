/** Synthetic local R2 CAS and RPC authority check; no live config, credentials or player data. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
const scratch = resolve(".local/checks/comparison-control");
await mkdir(scratch, { recursive: true });
process.env.TMPDIR = scratch;
const { Miniflare, convertV4MiniflareOptions } = await import("miniflare");
const compiled = await build({
  entryPoints: ["apps/ingest/src/worker.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  external: ["cloudflare:workers"],
  logLevel: "silent",
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    cf: false,
    workers: [
      {
        name: "synthetic-web",
        modules: true,
        compatibilityDate: "2026-10-23",
        script: `export default {async fetch(r,e){const v=await r.json();try {return Response.json(await e.CHECK[v.method](v.members));} catch {return Response.json({error:'Unavailable'},{status:503});}}};`,
        serviceBindings: {
          CHECK: {
            name: "synthetic-ingest",
            entrypoint: "ComparisonEligibility",
          },
        },
      },
      {
        name: "synthetic-ingest",
        modules: true,
        compatibilityDate: "2026-10-23",
        script: compiled.outputFiles[0].text,
        r2Buckets: ["CONTROL"],
        bindings: { COMPARISON_PRIVACY_ENABLED: "true" },
      },
    ],
  }),
);
try {
  const id = "synthetic-cas-owner",
    secret = "synthetic-original-secret-long-enough";
  const bucket = await mf.getR2Bucket("CONTROL", "synthetic-ingest");
  await bucket.put(
    `participants/${id}`,
    JSON.stringify({
      proof: createHash("sha256").update(secret).digest("hex"),
    }),
  );
  const ingest = await mf.getWorker("synthetic-ingest");
  const update = async (expectedRevision, stealth = false) =>
    ingest.fetch(
      `http://localhost/ingest/v1/participants/${id}/comparison-privacy`,
      {
        method: "POST",
        body: JSON.stringify({
          secret,
          expectedRevision,
          stealth,
          age: "adult",
        }),
      },
    );
  const check = async (method = "check", members = [id]) =>
    mf.dispatchFetch("http://localhost/", {
      method: "POST",
      body: JSON.stringify({ method, members }),
    });
  assert.deepEqual(await (await check()).json(), [null]);
  const created = await update(null);
  assert.equal(created.status, 200);
  const { revision } = await created.json();
  assert.deepEqual(await (await check()).json(), [revision]);
  // R2's real conditional-put behavior, not just an in-memory fake.
  const race = await Promise.all([
    update(revision, true),
    update(revision, true),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  assert.deepEqual(await (await check()).json(), [null]);
  assert.equal((await update(revision)).status, 409);
  for (const method of [
    "get",
    "put",
    "delete",
    "verify",
    "sql",
    "query",
    "env",
    "ctx",
    "constructor",
  ])
    assert.equal((await check(method)).status, 503);
  for (const members of [
    ["../proof"],
    [id, id],
    Array.from({ length: 101 }, (_, i) => `b${i}`),
  ])
    assert.equal((await check("check", members)).status, 503);
  await bucket.put(`deleted/${id}`, "{}");
  assert.equal((await update(null)).status, 410);
  assert.deepEqual(await (await check()).json(), [null]);
  console.log(
    "Synthetic comparison control: R2 CAS, stale writes, tombstones, method/path bounds passed.",
  );
} finally {
  await mf.dispose();
}
