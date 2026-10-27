import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { snapshot } from "./snapshot";

test("a snapshot is the model list and each model's endpoints, verbatim, failures included", async () => {
  const seen: { url: string; auth?: string }[] = [];
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    seen.push({ url, auth: (init.headers as Record<string, string>)?.authorization });
    if (url.endsWith("/models")) return new Response('{"data":[{"id":"a/one","pricing":{"prompt":"0.000003"}}]}', { headers: { "x-test": "1" } });
    if (url.includes("a/one")) return new Response('{"data":{"endpoints":[]}}');
    throw new Error("offline");
  }) as typeof fetch;
  let tick = 0;
  const rows = await snapshot({
    models: ["a/one:free", "b/two"],
    fetch: fetcher,
    now: () => new Date(Date.UTC(2026, 9, 27, 6, 0, tick++)),
  });
  assert.deepEqual(seen.map((s) => s.url), [
    "https://openrouter.ai/api/v1/models",
    "https://openrouter.ai/api/v1/models/a/one/endpoints",
    "https://openrouter.ai/api/v1/models/b/two/endpoints",
  ]);
  assert.equal(seen[0].auth, undefined);
  assert.deepEqual(rows.map((r) => r.snapshot_id), [0, 1, 2].map((i) => `2026-10-27T06:00:00.000Z.${i}`));
  assert.equal(rows[0].body, '{"data":[{"id":"a/one","pricing":{"prompt":"0.000003"}}]}');
  assert.equal(JSON.parse(rows[0].headers)["x-test"], "1");
  assert.deepEqual([rows[2].status, rows[2].body, rows[2].error], [null, null, "offline"]);
  const schema = JSON.parse(readFileSync(new URL("./catalog.schema.json", import.meta.url), "utf8"));
  for (const row of rows) assert.deepEqual(Object.keys(row), schema.fields.map((f: { name: string }) => f.name));
});
