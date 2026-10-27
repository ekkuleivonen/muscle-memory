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
            statsCalls++;
            assert.match(
              request.headers.get("authorization") ?? "",
              /synthetic-local-fixture/,
            );
            const body = await request.json();
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
    return { status: 200, headers, contentType: "application/json", body: JSON.stringify({ data: [{ id: "scripted/reference", supported_parameters: ["tools"] }] }) };
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
  await page.getByLabel("Model (as OpenRouter names it)").fill("scripted/reference");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByText("scripted/reference", { exact: true }).first().waitFor();
  await page.getByLabel("Tries").fill("1");
  await page.getByRole("button", { name: "Queue", exact: true }).click();
  await page.getByText("Queued 69 runs (reasoning default, 1 tries).").waitFor();
  await page.getByLabel("OpenRouter key").fill(fixtureKey);
  await page.getByLabel("Runs at a time").fill("1");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Stop after the current runs" }).click();
  await page.getByText(/→ (completed|stopped|budget|refused|error|harness failure)/).waitFor({ timeout: 180000 });
  const log = await page.getByRole("list", { name: "Runner log" }).innerText();
  assert.match(log, /→ completed, 2 turns, 1 submissions/, log);
  await page.getByText("Not running.").waitFor();
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

let browser;
let closing = false;
const routeErrors = [];
try {
  await mf.ready;
  if (modelRunsFixture) {
    const db = await mf.getD1Database("CATALOG_DB");
    const migration = await readFile("migrations/catalog/0002_model_runs.sql", "utf8");
    for (const statement of migration
      .replace(/--[^\n]*\n/g, "\n")
      .split(/;\s*\n(?=CREATE)/)
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
  for (const section of ["authoring", "benchmarks", "statistics"])
    await check(`/admin/${section}`, valid, 200);
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
  assert.match(await page.locator("main").innerText(), /Harness harness-\d+/);
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
    await page.getByRole("alert").waitFor();
    assert.match(
      await page.getByRole("alert").innerText(),
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
