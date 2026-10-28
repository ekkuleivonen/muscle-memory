/** Real local Worker/D1/R2 semantics, synthetic metadata only. No cloud reads or credentials. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
const scratch = resolve(".local/checks/model-summary-runtime");
await mkdir(scratch, { recursive: true, mode: 0o700 });
process.env.TMPDIR = scratch;
const { Miniflare, convertV4MiniflareOptions } = await import("miniflare");
const compiled = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
      import {modelReceipts} from './apps/web/lib/model-receipts-server.ts';
      import {scheduledModelSummaries} from './packages/model-runs/scheduled-summary.ts';
      export default {
        async fetch(request,env) {
          globalThis.testEnvironment=env;
          const url=new URL(request.url);
          if(url.pathname==='/refresh') return Response.json(await scheduledModelSummaries(env,0));
          return Response.json(await modelReceipts('JS-001','sha256:'+'a'.repeat(64)));
        }
      };`,
    loader: "ts",
  },
  plugins: [
    {
      name: "local-cloudflare-context",
      setup(b) {
        b.onResolve(
          { filter: /^(server-only|@opennextjs\/cloudflare)$/ },
          (args) => ({ path: args.path, namespace: "fixture" }),
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents:
            args.path === "server-only"
              ? ""
              : "export async function getCloudflareContext(){return {env:globalThis.testEnvironment}}",
          loader: "js",
        }));
      },
    },
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  logLevel: "silent",
  define: { "process.env.NODE_ENV": '"production"' },
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    cf: false,
    workers: [
      {
        name: "summary-fixture",
        modules: true,
        compatibilityDate: "2026-10-23",
        script: compiled.outputFiles[0].text,
        bindings: {
          MODEL_SUMMARY_CACHE_ENABLED: "true",
          NODE_ENV: "production",
        },
        r2Buckets: ["CONTENT"],
        d1Databases: ["CATALOG_DB"],
      },
    ],
  }),
);
try {
  const revision = `sha256:${"a".repeat(64)}`;
  // Deliberately no tables yet: the cold request must not fall back to any D1/raw read.
  assert.equal(
    (await (await mf.dispatchFetch("http://localhost/read")).json()).state,
    "unavailable",
  );
  const db = await mf.getD1Database("CATALOG_DB");
  await db.exec(
    "CREATE TABLE challenge_heads(challenge_key TEXT,lifecycle TEXT,published_revision TEXT); CREATE TABLE model_runs(model TEXT,harness_version TEXT,condition TEXT,try INTEGER,status TEXT,outcome TEXT,run_id TEXT,submissions INTEGER,challenge_key TEXT,revision TEXT);",
  );
  await db
    .prepare("INSERT INTO challenge_heads VALUES(?,?,?)")
    .bind("JS-001", "published", revision)
    .run();
  const refresh = await (
    await mf.dispatchFetch("http://localhost/refresh")
  ).json();
  assert.equal(refresh.refreshed, 1);
  const warmed = await (await mf.dispatchFetch("http://localhost/read")).json();
  assert.equal(warmed.state, "ready");
  assert.deepEqual(warmed.receipts, []);
  // Warm reads still work after the ledger disappears: serving only needs the snapshot.
  await db.exec("DROP TABLE model_runs;");
  assert.equal(
    (await (await mf.dispatchFetch("http://localhost/read")).json()).state,
    "ready",
  );
  const bucket = await mf.getR2Bucket("CONTENT");
  const keys = await bucket.list({ prefix: "comparison-summaries/models/" });
  assert.equal(keys.objects.length, 1);
  const key = keys.objects[0].key;
  const value = await (await bucket.get(key)).json();
  await bucket.put(key, JSON.stringify({ ...value, refreshedAt: 0 }));
  assert.equal(
    (await (await mf.dispatchFetch("http://localhost/read")).json()).state,
    "unavailable",
  );
  console.log(
    JSON.stringify({
      synthetic: true,
      coldNoRawFallback: true,
      scheduledRefresh: true,
      warmNoLedger: true,
      expiredUnavailable: true,
      snapshots: keys.objects.length,
    }),
  );
} finally {
  await mf.dispose();
}
