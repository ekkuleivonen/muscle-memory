/** Local workerd/browser security proof with ephemeral signed fixtures, NOT a live Access test.
 * Run after npm run build:cloudflare. No network, credentials, or production writes.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readFile, readdir, writeFile } from "node:fs/promises";
import {
  Miniflare,
  convertV4MiniflareOptions,
  Response as MFResponse,
} from "miniflare";
import { unstable_getMiniflareWorkerOptions } from "wrangler";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { chromium } from "playwright";

execFileSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "deploy",
    "--dry-run",
    "--config",
    "apps/web/wrangler.jsonc",
    "--outdir",
    "/tmp/mm-eng353-worker",
  ],
  { stdio: "inherit" },
);
const legal = await readFile("apps/web/lib/legal.ts", "utf8");
assert.ok(
  legal.includes('LEGAL_VERSION = "2026-10-27.1"'),
  "review local consent fixture if Terms change",
);
const issuer = "https://eng353-fixture.cloudflareaccess.com";
const aud = "a".repeat(64);
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwks = {
  keys: [
    {
      ...(await exportJWK(publicKey)),
      kid: "ephemeral-local-fixture",
      alg: "RS256",
      use: "sig",
    },
  ],
};
const now = Math.floor(Date.now() / 1000);
async function sign(claims = {}, key = privateKey) {
  return new SignJWT({
    sub: "local-synthetic-operator",
    email: "ekku.leivonen@gmail.com",
    type: "app",
    iss: issuer,
    aud,
    iat: now - 5,
    exp: now + 600,
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "ephemeral-local-fixture" })
    .sign(key);
}
const valid = await sign();
// Optional synthetic-only SQL service. No Cloudflare credentials or network requests.
const statsFixture = process.env.ADMIN_STATS_FIXTURE === "1";
// Model runs from the admin, with OpenRouter answered by a scripted "model" that writes each
// challenge's reference solution and submits it. No key, network or spending.
const modelRunsFixture = process.env.MODEL_RUNS_FIXTURE === "1";
const fixtureKey = "sk-or-local-fixture-not-a-credential";
const openRouterCalls = [];
let statsCalls = 0;
let statsMode = "data";
const statsRevision = "sha256:" + "a".repeat(64);
const statsCoverage = {
  scope: "coverage",
  observed: 21,
  duplicates: 2,
  conflicts: 0,
  known_synthetic: 0,
  unsupported: 0,
  first_observed: "2026-10-21T12:00:00.000Z",
  last_observed: "2026-10-21T12:05:00.000Z",
  last_received: "2026-10-21T12:06:00.000Z",
};
// The SQL workbench's synthetic R2 SQL: invented rows only, never real players or code.
const workbenchQueries = [];
const eventColumns = JSON.parse(
  await readFile("apps/ingest/events.schema.json", "utf8"),
).fields;
function syntheticRow(i) {
  return {
    id: i,
    name: ["Zoë 🦊", "=HYPERLINK(\"https://evil.test\")", "two\nlines", "plain"][i % 4],
    note: [null, "", 0, "x".repeat(600)][i % 4],
    payload: JSON.stringify({ type: "synthetic.fixture", data: { n: i, nested: { list: [1, 2, { deep: true }] } } }),
    extra_upstream_field: "NOT A SELECTED COLUMN",
  };
}
async function workbenchSql(query) {
  workbenchQueries.push(query);
  const ok = (schema, rows, metrics = { bytes_scanned: 12_345_678, files_scanned: 3 }) =>
    MFResponse.json({ success: true, result: { schema, rows, metrics } });
  if (query === "SHOW TABLES IN default")
    return ok(
      [{ name: "namespace" }, { name: "table_name" }],
      ["events", "model_events"].map((t) => ({ namespace: "default", table_name: t })),
      { bytes_scanned: 0, files_scanned: 0 },
    );
  const describe = /^DESCRIBE default\.(\w+)$/.exec(query);
  if (describe)
    return ok(
      [{ name: "column_name" }, { name: "type" }, { name: "required" }, { name: "doc" }],
      eventColumns.map((f) => ({ column_name: f.name, type: f.type, required: f.required, doc: null })),
      { bytes_scanned: 0, files_scanned: 0 },
    );
  if (query.includes("syntax_fixture"))
    return MFResponse.json(
      { success: false, errors: [{ code: 40001, message: "sql parser error: Expected: end of statement, found: syntax_fixture at Line: 2, Column: 3" }] },
      { status: 400 },
    );
  if (query.includes("slow_fixture")) await new Promise((r) => setTimeout(r, 2500));
  const limit = /LIMIT (\d+)\s*$/i.exec(query);
  const count = query.includes("empty_fixture") ? 0 : limit ? Number(limit[1]) : 500;
  return ok(
    [
      { name: "id", type: "Int64" },
      { name: "name", type: "Utf8" },
      { name: "note", type: "Utf8" },
      { name: "payload", type: "Utf8" },
    ],
    Array.from({ length: count }, (_, i) => syntheticRow(i)),
    query.includes("slow_fixture") ? { bytes_scanned: 1, files_scanned: 1 } : undefined,
  );
}
const wrong = await sign({ email: "wrong@example.test" });
const expired = await sign({ exp: now - 1 });
const foreignKey = await generateKeyPair("RS256");
const forged = await sign({}, foreignKey.privateKey);
const base = unstable_getMiniflareWorkerOptions(
  resolve("apps/web/wrangler.jsonc"),
);
const { modulesRules: _rules, ...workerOptions } = base.workerOptions;
const bundleDir = "/tmp/mm-eng353-worker";
const moduleFiles = (await readdir(bundleDir))
  .filter((n) => /\.(js|wasm|bin)$/.test(n))
  .sort((a, b) => (a === "worker.js" ? -1 : b === "worker.js" ? 1 : 0));
const mf = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        ...workerOptions,
        name: "muscle-memory",
        modulesRoot: bundleDir,
        // Miniflare's Node bridge substitutes a loopback Host header. This fixture-only
        // ingress restores the Host from the original request URL, as the real edge sends it.
        modules: [
          {
            path: `${bundleDir}/local-ingress.mjs`,
            type: "ESModule",
            contents: `import app from './worker.js'; export default {fetch(request, env, ctx) {
      const headers = new Headers(request.headers); headers.set('host', new URL(request.url).host);
      if (headers.has('x-eng353-local-origin')) { headers.set('origin', headers.get('x-eng353-local-origin')); headers.delete('x-eng353-local-origin'); }
      return app.fetch(new Request(request, {headers}), env, ctx);
    }};`,
          },
          ...moduleFiles.map((name) => ({
            path: `${bundleDir}/${name}`,
            type: name.endsWith(".js")
              ? "ESModule"
              : name.endsWith(".wasm")
                ? "CompiledWasm"
                : "Data",
          })),
        ],
        bindings: {
          ...base.workerOptions.bindings,
          CATALOG_MODE: "bundled",
          ADMIN_ACCESS_ISSUER: issuer,
          ADMIN_ACCESS_AUD: aud,
          ...(statsFixture
            ? {
                ADMIN_STATS_SQL_TOKEN:
                  "synthetic-local-fixture-not-a-credential",
              }
            : {}),
        },
        outboundService: async (request) => {
          if (
            statsFixture &&
            new URL(request.url).hostname === "api.sql.cloudflarestorage.com"
          ) {
            assert.match(
              request.headers.get("authorization") ?? "",
              /synthetic-local-fixture/,
            );
            const body = await request.json();
            if (!body.query.startsWith("WITH record_groups AS"))
              return workbenchSql(body.query);
            statsCalls++;
            assert.match(body.query, /^WITH record_groups AS/);
            assert.match(body.query, /FROM default.events/);
            assert.match(
              body.query,
              /challenge = 'JS-999'/,
              "existing immutable QA metadata shapes the query",
            );
            if (statsMode === "error")
              return new MFResponse("PRIVATE UPSTREAM ERROR", { status: 503 });
            return MFResponse.json({
              success: true,
              result: {
                rows: [
                  statsCoverage,
                  ...(statsMode === "empty"
                    ? []
                    : [
                        {
                          scope: "challenge",
                          challenge: "PY-003",
                          challenge_revision: statsRevision,
                          starts: 4,
                          browser_ids: 3,
                          completions: 2,
                          submissions: 7,
                          runs: 8,
                          missing_starts: 1,
                          participant_id: "PRIVATE BROWSER ID",
                          payload: "PRIVATE PLAYER CODE",
                        },
                        {
                          scope: "challenge",
                          challenge: "JS-001",
                          challenge_revision: statsRevision,
                          starts: 2,
                          browser_ids: 1,
                          completions: 2,
                          submissions: 3,
                          runs: 4,
                          missing_starts: 0,
                        },
                      ]),
                ],
              },
            });
          }
          assert.equal(
            request.url,
            `${issuer}/cdn-cgi/access/certs`,
            "unexpected outbound network",
          );
          return MFResponse.json(jwks);
        },
      },
    ],
  }),
);
const receipts = [];
async function check(path, token, expected, extra = {}) {
  const { host = "musclememory.run", method = "GET", headers = {}, body: sent } = extra;
  // The local bridge also validates Origin against its loopback listener; restore
  // the original supplied Origin only inside the fixture ingress, before real app code.
  const transportedHeaders = new Headers(headers);
  if (transportedHeaders.has("origin")) {
    transportedHeaders.set(
      "x-eng353-local-origin",
      transportedHeaders.get("origin"),
    );
    transportedHeaders.delete("origin");
  }
  const response = await mf.dispatchFetch(`https://${host}${path}`, {
    method,
    redirect: "manual",
    ...(sent ? { body: sent } : {}),
    headers: {
      host,
      ...(token ? { "cf-access-jwt-assertion": token } : {}),
      ...Object.fromEntries(transportedHeaders),
    },
  });
  const body = await response.text();
  assert.equal(
    response.status,
    expected,
    `${path}: ${response.status} ${body.slice(0, 200)}`,
  );
  if (
    path.startsWith("/admin") &&
    ["GET", "HEAD"].includes(method) &&
    expected !== 308
  ) {
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
  }
  if (expected >= 400)
    assert.ok(
      !body.includes("published challenges"),
      "denial must not include private inventory",
    );
  receipts.push({ path, method, host, status: response.status });
  return body;
}
/** OpenRouter as a scripted model: write the reference solution, then submit. */
const solutions = new Map();
async function scriptedOpenRouter(incoming, url) {
  openRouterCalls.push({
    path: url.pathname,
    authorization: incoming.headers()["authorization"] ?? null,
  });
  const headers = { "access-control-allow-origin": "*" };
  if (incoming.method() === "OPTIONS") return { status: 204, headers: { ...headers, "access-control-allow-headers": "*" } };
  if (url.pathname === "/api/v1/models")
    return { status: 200, headers, contentType: "application/json", body: JSON.stringify({ data: [{ id: "scripted/reference", name: "Scripted reference", supported_parameters: ["tools", "reasoning"], reasoning: { supported_efforts: ["low", "high"], default_effort: "high" }, pricing: { prompt: "0.000001", completion: "0.000002" } }] }) };
  if (url.pathname !== "/api/v1/chat/completions")
    return { status: 200, headers, contentType: "application/json", body: '{"data":{}}' };
  const body = JSON.parse(incoming.postData());
  const opening = body.messages[1].content;
  if (!solutions.size)
    for (const key of await readdir("content/challenges")) {
      const dir = resolve("content/challenges", key);
      const { title, file } = JSON.parse(await readFile(`${dir}/challenge.json`, "utf8"));
      const solution = (await readdir(`${dir}/private`)).find((f) => f.startsWith("solution."));
      solutions.set(file + "\u0000" + title, await readFile(`${dir}/private/${solution}`, "utf8"));
    }
  const solution = [...solutions].find(([k]) => {
    const [file, title] = k.split("\u0000");
    return opening.startsWith(`# ${title}\n`) && opening.includes(`## Your code: ${file} (`);
  })?.[1];
  assert.ok(solution, "the scripted model knows the challenge");
  const turn = body.messages.filter((m) => m.role === "assistant").length;
  const [name, args] = turn === 0 ? ["write_code", { text: solution }] : ["submit", {}];
  const lines = [
    ": OPENROUTER PROCESSING",
    `data: ${JSON.stringify({ id: `gen-${turn}`, model: "scripted/reference", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call-${turn}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] })}`,
    `data: ${JSON.stringify({ id: `gen-${turn}`, choices: [{ index: 0, delta: { content: "" }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.000001 } })}`,
    "data: [DONE]",
    "",
  ];
  return { status: 200, headers, contentType: "text/event-stream", body: lines.join("\n") };
}

/** One model run from the Benchmarks page: roster, queue, run, hand in, stored. */
async function modelRun(page) {
  const card = page.locator("details.admin-model");
  await page.getByLabel("Add a model (as OpenRouter names it)").fill("scripted/reference");
  await page.getByRole("button", { name: "Add model", exact: true }).click();
  // Added with only its default level on.
  await card.getByText(/1 of 2 levels on · 0% covered · 69 runs left/).waitFor();
  await page.getByText(/69 of 69/).waitFor();
  await page.getByLabel("OpenRouter key").fill(fixtureKey);
  await page.getByLabel("Runs at a time").fill("1");
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await page.getByText("Queued 69 missing runs.").waitFor();
  // Stop once the first run is under way: it finishes, and nothing more is claimed.
  await page.getByText(/scripted\/reference · high · [A-Z]+-\d{3} · try 1/).waitFor();
  await page.getByRole("button", { name: "Stop after the current runs" }).click();
  await page.getByText(/→ (completed|stopped|budget|refused|error|harness failure)/).waitFor({ timeout: 180000 });
  const log = await page.getByRole("list", { name: "Runner log" }).innerText();
  assert.match(log, /→ completed, 2 turns, 1 submissions/, log);
  await page.getByText("Not running.").waitFor();
  await page.getByText(/68 of 69/).waitFor();
  // Go is idempotent: the queue already holds exactly what is missing.
  const again = JSON.parse(
    await check("/admin/api/model-runs/sync", valid, 200, {
      method: "POST",
      headers: { origin: "https://musclememory.run", "sec-fetch-site": "same-origin", "content-type": "application/json" },
      body: "{}",
    }),
  );
  assert.deepEqual(again, { queued: 0, dropped: 0 });
  // The card: the default level tagged, its coverage and an estimate from its own run.
  await card.locator("summary").click();
  const levels = page.getByRole("region", { name: "scripted/reference reasoning levels" });
  const high = levels.getByRole("row").filter({ hasText: /^.*high/ });
  assert.match(await high.innerText(), /high\s*default/i);
  assert.match(await high.innerText(), /1 \/ 69/);
  assert.match(await high.innerText(), /≈ \$|under \$0\.01/);
  // Switching on another level adds its runs to do, estimated from the model's other runs.
  await page.getByLabel("Run scripted/reference at low").check();
  await card.getByText(/2 of 2 levels on/).waitFor();
  await page.getByText(/137 of 138/).waitFor();
  assert.match(await levels.getByRole("row").filter({ hasText: /^.*low/ }).innerText(), /from other levels/);
  await page.screenshot({ path: "/tmp/mm-eng342-benchmarks.png", fullPage: true });
  const overview = JSON.parse(await check("/admin/api/model-runs", valid, 200));
  const finished = overview.recent.find((r) => r.status === "finished");
  assert.equal(finished.outcome, "completed");
  assert.equal(overview.recent.length, 1, "one run was claimed");
  const bucket = await mf.getR2Bucket("CONTENT");
  const stored = await bucket.get(`model-runs/outbox/${finished.run_id}.ndjson`);
  assert.ok(stored, "the run's rows are in private R2");
  const text = await stored.text();
  assert.ok(!text.includes(fixtureKey), "the key is never stored");
  const rows = text.trim().split("\n").map((line) => JSON.parse(line));
  const observations = rows.filter((r) => r.kind === "observation").map((r) => JSON.parse(r.payload));
  assert.ok(observations.every((o) => o.actor === "model" && o.termsVersion === null));
  assert.ok(observations.some((o) => o.type === "practice.completed"));
  assert.ok(observations.some((o) => o.type === "model.generation"));
  const priced = overview.coverage.filter((c) => c.status === "finished");
  assert.ok(priced.length === 1 && priced[0].cost > 0, "the run's cost is in the ledger");
  assert.ok(
    openRouterCalls.filter((c) => c.path === "/api/v1/chat/completions").every((c) => c.authorization === `Bearer ${fixtureKey}`),
  );
  // A finished run can't be finished again, or with another tab's records.
  await check(`/admin/api/model-runs/${finished.run_id}`, valid, 409, {
    method: "POST",
    headers: { origin: "https://musclememory.run", "sec-fetch-site": "same-origin", "content-type": "application/json" },
    body: JSON.stringify({ action: "failed", error: "a second tab" }),
  });
}

/** The SQL workbench in Chromium against the synthetic R2 SQL above. */
async function workbench(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const opened = workbenchQueries.length;
  await page.getByRole("link", { name: "SQL", exact: true }).click();
  await page.getByRole("heading", { name: "SQL workbench", exact: true }).waitFor();
  if (!statsFixture) {
    await page.getByText(/credential is not configured/).waitFor();
    assert.equal(await page.getByRole("button", { name: /Run statement/ }).isDisabled(), true);
    return;
  }
  const editor = page.getByRole("textbox", { name: "SQL query" });
  const status = page.getByRole("status");
  const runs = () => workbenchQueries.slice(opened).filter((q) => !/^(SHOW|DESCRIBE)/.test(q));
  // Opening reads metadata once (no cached schema yet) and runs nothing else.
  await page.getByRole("button", { name: "model_events", exact: true }).waitFor();
  assert.equal(runs().length, 0, "opening the workbench runs no query");
  assert.ok(workbenchQueries.includes("SHOW TABLES IN default"));
  await page.getByLabel("Filter tables and columns").fill("occurred");
  assert.equal(await page.getByRole("button", { name: "occurred_at", exact: true }).count(), 2);
  await page.getByLabel("Filter tables and columns").fill("");

  // Completion from the live schema, then the statement at the cursor runs.
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type("SELECT 1 AS one;\n\nSELECT id, name, note, payload FROM default.ev");
  await page.locator(".cm-tooltip-autocomplete").getByText("events", { exact: true }).waitFor();
  await page.keyboard.press("Enter");
  await page.keyboard.type(" LIMIT 1200");
  assert.match(await editor.innerText(), /FROM default\.events LIMIT 1200/);
  await page.keyboard.press("ControlOrMeta+Enter");
  await status.getByText(/1,200 rows/).waitFor();
  assert.equal(runs().at(-1), "SELECT id, name, note, payload FROM default.events LIMIT 1200");
  assert.match(await status.innerText(), /scanned 12\.3 MB in 3 files/);
  const grid = page.getByRole("grid", { name: "Query results" });
  assert.equal(await grid.getAttribute("aria-rowcount"), "1201");
  // Virtualised: far fewer rows in the page than returned.
  assert.ok((await grid.getByRole("row").count()) < 100);
  assert.match(await grid.getByRole("columnheader").first().innerText(), /id\s*Int64/);
  assert.equal(await grid.locator(".sql-null").count() > 0, true, "NULL is distinct");
  assert.equal(await grid.locator(".sql-empty").count() > 0, true, "empty text is distinct");
  assert.match(await grid.innerText(), /Zoë 🦊/);
  assert.ok(!(await page.content()).includes("NOT A SELECTED COLUMN"));
  await page.screenshot({ path: "/tmp/mm-eng373-sql-results.png" });

  // Local sort and filter say they cover the returned rows.
  await grid.getByRole("button", { name: /^id/ }).click();
  await grid.getByRole("button", { name: /^id/ }).click();
  assert.match(await page.locator(".sql-grid-tools").innerText(), /sorted by id ↓ here, among these rows/);
  assert.match(await grid.getByRole("row").nth(1).innerText(), /1199/);
  await page.getByPlaceholder("Filter returned rows").fill("Zoë");
  assert.match(await page.locator(".sql-grid-tools").innerText(), /300 of 1200 returned rows/);
  // The inspector shows JSON as a tree.
  await grid.getByRole("gridcell").nth(3).dblclick();
  const inspector = page.getByRole("complementary", { name: "Value inspector" });
  await inspector.getByText("deep:").waitFor();
  await page.screenshot({ path: "/tmp/mm-eng373-sql-inspector.png" });
  await inspector.getByRole("button", { name: "Close the inspector" }).click();
  // CSV of the shown rows: BOM, quoting, and formulas defused.
  await page.getByPlaceholder("Filter returned rows").fill("");
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV", exact: true }).click()]);
  const text = await readFile(await csv.path(), "utf8");
  assert.ok(text.startsWith("\uFEFFid,name,note,payload\r\n"));
  assert.match(text, /"'=HYPERLINK\(""https:\/\/evil\.test""\)"/);
  assert.match(text, /"two\nlines"/);
  assert.equal(text.trim().split("\r\n").length, 1201);

  // No LIMIT: R2 SQL's own 500-row default is pointed out.
  const replace = async (sql) => {
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
    await page.keyboard.insertText(sql);
  };
  await replace("SELECT id FROM default.events");
  await page.getByRole("button", { name: /Run statement/ }).click();
  await page.getByText(/R2 SQL returns at most 500 rows without one/).waitFor();

  // Refused here: nothing is sent, and the editor marks where.
  const sent = runs().length;
  await replace("SELECT 1;\nDELETE FROM default.events");
  await page.keyboard.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Run selection" }).click();
  await status.getByText(/Not run: Run one statement at a time/).waitFor();
  assert.equal(runs().length, sent);
  await page.locator(".cm-lintRange-error").waitFor();
  // An engine error: its message, and its place marked.
  await replace("SELECT 1\n  syntax_fixture");
  await page.keyboard.press("ControlOrMeta+Enter");
  await status.getByText(/R2 SQL error: sql parser error/).waitFor();
  assert.equal(await page.locator(".cm-lintRange-error").innerText(), "syntax_fixture");
  await page.screenshot({ path: "/tmp/mm-eng373-sql-error.png" });

  // Stop waiting, then a newer query: the older answer never replaces it.
  await replace("SELECT id FROM default.events WHERE 'slow_fixture' = 'slow_fixture'");
  await page.keyboard.press("ControlOrMeta+Enter");
  await status.getByText(/Running the statement/).waitFor();
  await page.getByRole("button", { name: "Stop waiting" }).click();
  await status.getByText(/Stopped waiting.*R2 SQL cannot cancel a query/).waitFor();
  await replace("SELECT id FROM default.events LIMIT 3");
  await page.keyboard.press("ControlOrMeta+Enter");
  await status.getByText(/^3 rows/).waitFor();
  await page.waitForTimeout(3000);
  assert.match(await status.innerText(), /^3 rows/, "a stopped query's late answer is ignored");
  // Run while running: queued, then run.
  await replace("SELECT id FROM default.events WHERE 'slow_fixture' = 'slow_fixture'");
  await page.keyboard.press("ControlOrMeta+Enter");
  await status.getByText(/Running the statement/).waitFor();
  await replace("SELECT id FROM default.events LIMIT 4");
  await page.keyboard.press("ControlOrMeta+Enter");
  await status.getByText(/then line 1/).waitFor();
  await status.getByText(/^4 rows/).waitFor({ timeout: 10000 });
  await replace("SELECT 1 AS empty_fixture LIMIT 0");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.getByText("No rows.").waitFor();

  // Formatting keeps strings exactly.
  await replace("select type,'a  ;  b' as s from default.events where kind='x' and n between 1 and 2 limit 5");
  await page.getByRole("button", { name: /^Format/ }).click();
  assert.equal(
    (await editor.innerText()).trimEnd(),
    "SELECT\n  type,\n  'a  ;  b' AS s\nFROM default.events\nWHERE kind = 'x'\n  AND n BETWEEN 1 AND 2\nLIMIT 5",
  );
  // Each tab has its own undo history: undo in a new tab never brings back another tab's text.
  // The document's text, without the placeholder an empty editor shows.
  const docText = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".cm-content .cm-line")]
        .map((line) => (line.querySelector(".cm-placeholder") ? "" : line.textContent))
        .join("\n")
        .trim(),
    );
  await page.getByRole("button", { name: "New tab" }).click();
  await page.keyboard.type("SELECT 2");
  for (let i = 0; i < 6; i++) await page.keyboard.press("ControlOrMeta+z");
  assert.equal(await docText(), "", "undo stops at the new tab's own start");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  assert.equal(await docText(), "SELECT 2", "redo restores the new tab's own text");
  await page.getByRole("tab", { name: "Query 1" }).click();
  await page.keyboard.press("ControlOrMeta+z");
  const undone = await docText();
  assert.match(undone, /^select type,'a {2};/, `Query 1 keeps its own history (undoes its format): ${JSON.stringify(undone)}`);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  // Closing the only other tab, and the sole remaining one, leaves a fresh empty tab.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Close Query 2" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Close Query 1" }).click();
  assert.equal(await docText(), "");
  await page.keyboard.press("ControlOrMeta+z");
  assert.equal(await docText(), "", "a fresh tab has nothing to undo");
  await page.keyboard.insertText("select type,'a  ;  b' as s from default.events where kind='x' and n between 1 and 2 limit 5");
  await page.getByRole("button", { name: /^Format/ }).click();
  // Tabs and drafts survive a reload; results do not, and are never stored.
  await page.getByRole("button", { name: "New tab" }).click();
  await page.keyboard.insertText("SELECT 'second tab draft'");
  await page.waitForTimeout(600);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  assert.ok(!stored.includes("Zoë"), "results are not persisted");
  await page.reload();
  await page.getByRole("heading", { name: "SQL workbench", exact: true }).waitFor();
  await page.getByText("SELECT 'second tab draft'").waitFor();
  await page.getByRole("tab", { name: "Query 1" }).click();
  await page.getByText("'a  ;  b' AS s").waitFor();
  assert.equal(await page.getByRole("grid").count(), 0, "results are not restored");
  await page.getByRole("tab", { name: "History" }).click();
  await page.getByText(/SELECT id FROM default\.events LIMIT 4/).waitFor();
  await page.screenshot({ path: "/tmp/mm-eng373-sql-history.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    "mobile workbench overflow",
  );
  await page.screenshot({ path: "/tmp/mm-eng373-sql-mobile.png", fullPage: true });
}

let browser;
let closing = false;
const routeErrors = [];
try {
  await mf.ready;
  if (modelRunsFixture) {
    const db = await mf.getD1Database("CATALOG_DB");
    for (const file of ["0002_model_runs.sql", "0003_model_run_targets.sql", "0004_model_list_and_costs.sql"])
    for (const statement of (await readFile(`migrations/catalog/${file}`, "utf8"))
      .replace(/--[^\n]*\n/g, "\n")
      .split(/;\s*\n/)
      .map((s) => s.trim().replace(/;$/, ""))
      .filter(Boolean))
      await db.prepare(statement).run();
  }
  if (statsFixture) {
    const db = await mf.getD1Database("CATALOG_DB");
    await db.exec(
      "CREATE TABLE published_versions (challenge_key TEXT, revision TEXT, metadata_json TEXT)",
    );
    await db
      .prepare("INSERT INTO published_versions VALUES (?, ?, ?)")
      .bind(
        "JS-999",
        "sha256:" + "f".repeat(64),
        JSON.stringify({ tags: ["synthetic-qa"] }),
      )
      .run();
  }
  for (const path of [
    "/admin",
    "/admin/statistics?run=1&from=2026-10-20&to=2026-10-26",
    "/admin/authoring",
    "/admin/api/catalog",
    "/api/admin/catalog",
    "/%61dmin/api/catalog",
    "/admin%2fapi/catalog",
  ]) {
    for (const token of [null, "forged", wrong, expired, forged])
      await check(path, token, 403);
  }
  await check("/admin", null, 403, {
    headers: {
      "cf-access-authenticated-user-email": "ekku.leivonen@gmail.com",
    },
  });
  for (const path of ["/admin", "/admin/api/catalog"]) {
    await check(path, valid, 403, {
      host: "muscle-memory.example.workers.dev",
    });
    await check(path, valid, 403, {
      headers: { "x-forwarded-host": "evil.test" },
    });
  }
  const html = await check("/admin", valid, 200);
  assert.ok(
    html.includes("published challenges"),
    "inventory summary is rendered",
  );
  const api = JSON.parse(await check("/admin/api/catalog", valid, 200));
  assert.equal(api.challenges.length, 69);
  assert.ok(
    api.challenges.every(
      (c) =>
        c.status === "published" &&
        c.benchmark === "unavailable" &&
        !c.starter &&
        !c.cases,
    ),
  );
  for (const section of ["authoring", "benchmarks", "statistics", "sql"])
    await check(`/admin/${section}`, valid, 200);
  // The SQL workbench's endpoints: Access, identity and origin, then the read-only check.
  const sameOrigin = {
    origin: "https://musclememory.run",
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
  };
  for (const path of ["/admin/sql", "/admin/api/sql/query", "/admin/api/sql/schema"])
    for (const token of [null, wrong, expired, forged]) {
      await check(path, token, 403);
      await check(path, token, 403, { method: "POST", headers: sameOrigin, body: '{"sql":"SELECT 1"}' });
    }
  for (const path of ["/admin/api/sql/query", "/admin/api/sql/schema"]) {
    await check(path, valid, 403, {
      method: "POST",
      headers: { ...sameOrigin, origin: "https://evil.test", "sec-fetch-site": "cross-site" },
      body: '{"sql":"SELECT 1"}',
    });
    await check(path, valid, 403, { method: "POST", body: '{"sql":"SELECT 1"}' });
    await check(path, valid, 405);
  }
  const before = workbenchQueries.length;
  for (const sql of [
    "DROP TABLE default.events",
    "SELECT 1; DELETE FROM default.events",
    "SELECT * FROM other_namespace.secrets",
    "SELECT 'a\\'; DROP TABLE default.events; --'",
    "WITH x AS (DELETE FROM default.events) SELECT 1",
  ]) {
    const denied = JSON.parse(
      await check("/admin/api/sql/query", valid, statsFixture ? 400 : 503, {
        method: "POST",
        headers: sameOrigin,
        body: JSON.stringify({ sql }),
      }),
    );
    if (statsFixture) assert.equal(denied.error.kind, "rejected", sql);
  }
  assert.equal(workbenchQueries.length, before, "rejected SQL never reaches R2 SQL");
  if (statsFixture) {
    const read = await check("/admin/api/sql/query", valid, 200, {
      method: "POST",
      headers: sameOrigin,
      body: JSON.stringify({ sql: "SELECT id, name FROM default.events LIMIT 2" }),
    });
    assert.ok(!read.includes("synthetic-local-fixture-not-a-credential"), "no credential in responses");
    assert.ok(!read.includes("NOT A SELECTED COLUMN"), "only the reported columns pass");
    assert.equal(JSON.parse(read).rows.length, 2);
    // R2 SQL's own parser decides: another namespace is refused in any SQL form, before
    // anything is sent; a string, comment or alias spelled like one is just text.
    const reads = workbenchQueries.length;
    for (const sql of ["((SELECT 1) UNION SELECT 1 FROM private_fixture.t)", "SELECT * FROM (private_fixture.t a CROSS JOIN default.events b)"]) {
      const refused = JSON.parse(
        await check("/admin/api/sql/query", valid, 400, { method: "POST", headers: sameOrigin, body: JSON.stringify({ sql }) }),
      );
      assert.equal(refused.error.kind, "rejected", sql);
    }
    assert.equal(workbenchQueries.length, reads, "refused before any data query");
    await check("/admin/api/sql/query", valid, 200, {
      method: "POST",
      headers: sameOrigin,
      body: JSON.stringify({ sql: "SELECT 'private_fixture.t' AS private_fixture FROM default.events AS private_fixture -- private_fixture.t\nLIMIT 1" }),
    });
  }
  for (const section of ["constructor", "toString", "__proto__"])
    await check(`/admin/${section}`, valid, 404);
  await check("/admin/api/catalog", valid, 403, {
    method: "POST",
    headers: { origin: "https://evil.test", "sec-fetch-site": "cross-site" },
  });
  await check("/admin/api/catalog", valid, 403, { method: "POST" });
  await check("/admin/api/catalog", valid, 405, {
    method: "POST",
    headers: {
      origin: "https://musclememory.run",
      "sec-fetch-site": "same-origin",
    },
  });
  await check("/", null, 200);
  await check("/challenges", null, 200, {
    headers: { cookie: "mm_consent=2026-10-27.1" },
  });

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  // Synthetic local profile only; all requests below are fulfilled by the local Worker.
  await context.addInitScript(() => {
    if (!localStorage.getItem("muscle-memory.profile"))
      localStorage.setItem(
        "muscle-memory.profile",
        JSON.stringify({
          version: "2",
          createdAt: new Date().toISOString(),
          profile: {},
          accepted: { version: "2026-10-27.1", at: new Date().toISOString() },
        }),
      );
  });
  await context.addCookies([
    {
      name: "mm_consent",
      value: "2026-10-27.1",
      domain: "musclememory.run",
      path: "/",
      secure: true,
      sameSite: "Lax",
    },
  ]);
  let mode = "allowed";
  let uploads = 0;
  await context.route("**/*", async (route) => {
    try {
      const incoming = route.request();
      const url = new URL(incoming.url());
      if (modelRunsFixture && url.origin === "https://openrouter.ai") {
        await route.fulfill(await scriptedOpenRouter(incoming, url));
        return;
      }
      assert.equal(
        url.origin,
        "https://musclememory.run",
        "browser requested unexpected origin",
      );
      // Mirror the production static-assets route using the exact generated bytes.
      // Dynamic admin/page/API requests still pass through the actual built Worker.
      if (url.pathname.startsWith("/_next/static/")) {
        const body = await readFile(
          resolve("apps/web/.open-next/assets", `.${url.pathname}`),
        );
        const contentType = url.pathname.endsWith(".css")
          ? "text/css"
          : url.pathname.endsWith(".js")
            ? "application/javascript"
            : "application/octet-stream";
        await route.fulfill({ status: 200, contentType, body });
        return;
      }
      if (url.pathname.startsWith("/ingest/")) {
        uploads++;
        await route.fulfill({
          status: 503,
          body: "Synthetic local QA: upload blocked",
        });
        return;
      }
      const h = {
        ...incoming.headers(),
        host: url.host,
        ...(mode !== "anonymous"
          ? { "cf-access-jwt-assertion": mode === "expired" ? expired : valid }
          : {}),
      };
      const res = await mf.dispatchFetch(incoming.url(), {
        method: incoming.method(),
        headers: h,
        ...(incoming.postDataBuffer()
          ? { body: incoming.postDataBuffer() }
          : {}),
        redirect: "manual",
      });
      await route.fulfill({
        status: res.status,
        headers: Object.fromEntries(res.headers),
        body: Buffer.from(await res.arrayBuffer()),
      });
    } catch (error) {
      if (!closing)
        routeErrors.push({ url: route.request().url(), error: String(error) });
      await route.abort().catch(() => {});
    }
  });
  const page = await context.newPage();
  await page.goto("https://musclememory.run/admin");
  await page
    .getByRole("heading", { name: "Challenges", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => getComputedStyle(document.body).margin === "0px",
  );
  assert.equal(await page.getByRole("row").count(), 70);
  await page.getByRole("link", { name: "Benchmarks", exact: true }).click();
  await page
    .getByRole("heading", { name: "Benchmarks", exact: true })
    .waitFor();
  assert.match(await page.locator("main").innerText(), /with harness harness-\d+/);
  if (modelRunsFixture) await modelRun(page);
  await page.getByRole("link", { name: "Statistics", exact: true }).click();
  await page
    .getByRole("heading", { name: "Challenge statistics", exact: true })
    .waitFor();
  assert.match(await page.locator("main").innerText(), /not human-only/);
  assert.equal(
    statsCalls,
    0,
    "opening admin statistics does not query automatically",
  );
  if (statsFixture) {
    await page.getByLabel("From (UTC)", { exact: true }).fill("2026-10-20");
    await page.getByLabel("Through (UTC)", { exact: true }).fill("2026-10-26");
    await page.getByRole("button", { name: "Load statistics" }).click();
    await page
      .getByRole("region", { name: "Challenge statistics" })
      .waitFor({ timeout: 10000 })
      .catch(async (error) => {
        console.error("Synthetic statistics diagnostic", {
          sqlCalls: statsCalls,
          rendered: await page.locator("main").innerText(),
        });
        throw error;
      });
    assert.equal(statsCalls, 1);
    assert.match(await page.locator("main").innerText(), /50\.0% \(2\/4\)/);
    assert.ok(!(await page.content()).includes("PRIVATE PLAYER CODE"));
    assert.ok(!(await page.content()).includes("PRIVATE BROWSER ID"));
    assert.ok(
      !(await page.content()).includes(
        "synthetic-local-fixture-not-a-credential",
      ),
    );
    await page
      .getByLabel("Sort rows", { exact: true })
      .selectOption("challenge");
    assert.match(await page.locator("tbody tr").first().innerText(), /JS-001/);
    assert.equal(statsCalls, 1, "local sorting does not repeat a SQL scan");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "mobile stats overflow",
    );
    await page.getByRole("region", { name: "Challenge statistics" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.screenshot({
      path: "/tmp/mm-eng355-statistics-mobile.png",
      fullPage: false,
    });
    statsMode = "empty";
    await page.getByRole("button", { name: "Load statistics" }).click();
    await page.getByText(/No supported challenge activity/).waitFor();
    statsMode = "error";
    await page.getByRole("button", { name: "Load statistics" }).click();
    await page.locator("main").getByRole("alert").waitFor();
    assert.match(
      await page.locator("main").getByRole("alert").innerText(),
      /unavailable, not zero/,
    );
    assert.ok(!(await page.content()).includes("PRIVATE UPSTREAM ERROR"));
    const calls = statsCalls;
    await page.getByLabel("From (UTC)", { exact: true }).fill("2025-01-01");
    await page.getByRole("button", { name: "Load statistics" }).click();
    await page.getByText("Choose between 1 and 31 UTC days.").waitFor();
    assert.equal(statsCalls, calls, "invalid filter never queries");
  } else {
    assert.match(
      await page.locator("main").innerText(),
      /Statistics access is not configured/,
    );
    assert.equal(
      await page.getByRole("button", { name: "Load statistics" }).isDisabled(),
      true,
    );
  }
  await workbench(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Challenges", exact: true }).click();
  await page
    .getByRole("heading", { name: "Challenges", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "mobile viewport overflow",
  );
  await page.screenshot({
    path: "/tmp/mm-eng353-admin-mobile.png",
    fullPage: false,
  });
  assert.equal(
    (await page.evaluate(() => indexedDB.databases())).length,
    0,
    "operator navigation must not open player records",
  );
  assert.equal(uploads, 0, "operator activity should not upload player data");
  mode = "expired";
  const expiredPage = await page.reload();
  assert.equal(expiredPage.status(), 403);
  mode = "anonymous";
  const denied = await page.reload();
  assert.equal(denied.status(), 403);
  assert.ok(
    !(await page.locator("body").innerText()).includes("published challenges"),
  );
  await page.goto("https://musclememory.run/");
  assert.ok((await page.locator("body").innerText()).includes("Muscle Memory"));
  await page.waitForFunction(async () => {
    const dbs = await indexedDB.databases();
    return dbs.some(
      (db) => db.name === "muscle-memory-local-practice" && db.version === 5,
    );
  });
  await page.waitForFunction(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("muscle-memory-local-practice");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const count = await new Promise((resolve, reject) => {
      const r = db.transaction("records").objectStore("records").count();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return count > 0;
  });
  const records = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("muscle-memory-local-practice");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const r = db.transaction("records").objectStore("records").getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return rows;
  });
  assert.ok(
    records.length > 0,
    "public player page still records with accepted synthetic profile",
  );
  assert.ok(
    !JSON.stringify(records).includes('"path":"/admin'),
    "admin must not become player telemetry",
  );
  await context.close();
  await writeFile(
    "/tmp/mm-eng353-security-receipts.json",
    JSON.stringify(
      {
        kind: "local-workerd-and-browser-signed-fixtures-not-live-Access",
        checks: receipts,
        browser:
          "allowed shell, 69 rows, sections, mobile, expired/anonymous reload, public route",
        uploads,
      },
      null,
      2,
    ),
  );
  console.log(
    `Local workerd ${receipts.length} request checks + browser passed; no live Access claim.`,
  );
} catch (error) {
  console.error("LOCAL_CHECK_FAILURE", String(error), routeErrors);
  throw error;
} finally {
  closing = true;
  await browser?.close();
  await mf.dispose();
}
