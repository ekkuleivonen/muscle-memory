/** Synthetic local Workers-runtime check. No catalog, cloud requests, credentials or player data. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

// Keep runtime scratch inside the worktree. Uses Miniflare pinned by installed Wrangler.
const scratch = resolve(".local/checks/owner-rpc-runtime");
await mkdir(scratch, { recursive: true, mode: 0o700 });
process.env.TMPDIR = scratch;
const { Miniflare, convertV4MiniflareOptions } = await import("miniflare");
const config = async (path) =>
  JSON.parse(
    (await readFile(path, "utf8"))
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/,\s*([}\]])/g, "$1"),
  );
const webConfig = await config("apps/web/wrangler.jsonc"),
  ingestConfig = await config("apps/ingest/wrangler.jsonc");
const binding = webConfig.services.find(
  (b) => b.binding === "PARTICIPANT_OWNER",
);
assert.deepEqual(binding, {
  binding: "PARTICIPANT_OWNER",
  service: "muscle-memory-ingest",
  entrypoint: "ParticipantOwner",
});
assert.ok(!webConfig.r2_buckets.some((b) => b.binding === "CONTROL"));
const compiled = await build({
  entryPoints: [resolve("apps/ingest", ingestConfig.main)],
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
        name: "muscle-memory",
        modules: true,
        compatibilityDate: "2026-10-23",
        script: `export default {async fetch(request,env){const v=await request.json();try {if(v.method==='probe-control'){const leaked=await env.PARTICIPANT_OWNER.env;const stored=await leaked.CONTROL.get('participants/'+v.participant);return Response.json({raw:await stored.text()});}return Response.json({status:await env.PARTICIPANT_OWNER[v.method??'verify'](v.participant,v.secret)});} catch {return Response.json({unavailable:true},{status:400});}}};`,
        serviceBindings: {
          [binding.binding]: {
            name: binding.service,
            entrypoint: binding.entrypoint,
          },
        },
      },
      {
        name: "muscle-memory-ingest",
        modules: true,
        compatibilityDate: "2026-10-23",
        script: compiled.outputFiles[0].text,
        r2Buckets: ["CONTROL"],
      },
    ],
  }),
);
const participant = "synthetic-owner-rpc",
  secret = "synthetic-owner-secret-for-runtime-check-only";
try {
  const bucket = await mf.getR2Bucket("CONTROL", "muscle-memory-ingest");
  const call = async (
    method = "verify",
    who = participant,
    credential = secret,
  ) =>
    mf.dispatchFetch("http://localhost/check", {
      method: "POST",
      body: JSON.stringify({ method, participant: who, secret: credential }),
    });
  await bucket.put(
    `participants/${participant}`,
    JSON.stringify({
      proof: createHash("sha256").update(secret).digest("hex"),
    }),
  );
  assert.deepEqual(await (await call()).json(), { status: "owned" });
  assert.deepEqual(
    await (
      await call(
        "verify",
        participant,
        "synthetic-wrong-secret-with-thirty-two-characters",
      )
    ).json(),
    { status: "denied" },
  );
  assert.deepEqual(
    await (
      await call(
        "verify",
        participant,
        createHash("sha256").update(secret).digest("hex"),
      )
    ).json(),
    { status: "denied" },
  );
  assert.deepEqual(
    await (await call("verify", "another-synthetic-owner")).json(),
    { status: "absent" },
  );
  for (const method of [
    "get",
    "put",
    "delete",
    "query",
    "sql",
    "env",
    "ctx",
    "constructor",
    "probe-control",
    "check",
    "generation",
    "authorize",
  ]) {
    assert.equal((await call(method)).status, 400);
  }
  const ingest = await mf.getWorker("muscle-memory-ingest");
  assert.equal(
    (
      await ingest.fetch(
        `http://localhost/ingest/v1/participants/${participant}/history`,
        { method: "POST", body: JSON.stringify({ secret }) },
      )
    ).status,
    404,
  );
  await bucket.put(
    `deleted/${participant}`,
    JSON.stringify({ requestedAt: "2026-10-27T00:00:00Z" }),
  );
  assert.deepEqual(await (await call()).json(), { status: "deleted" });
  await bucket.delete(`participants/${participant}`);
  assert.deepEqual(await (await call()).json(), { status: "deleted" });
  console.log(
    "Synthetic native owner RPC: passed (ownership, hash rejection, isolation, deletion, method boundary, no public ingest history).",
  );
} finally {
  await mf.dispose();
}
