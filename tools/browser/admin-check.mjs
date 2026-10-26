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
  legal.includes('LEGAL_VERSION = "2026-10-26.2"'),
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
        },
        outboundService: async (request) => {
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
  const { host = "musclememory.run", method = "GET", headers = {} } = extra;
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
let browser;
let closing = false;
const routeErrors = [];
try {
  await mf.ready;
  for (const path of [
    "/admin",
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
    headers: { cookie: "mm_consent=2026-10-26.2" },
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
          accepted: { version: "2026-10-26.2", at: new Date().toISOString() },
        }),
      );
  });
  await context.addCookies([
    {
      name: "mm_consent",
      value: "2026-10-26.2",
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
  assert.match(
    await page.locator("main").innerText(),
    /No benchmark service is connected/,
  );
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
