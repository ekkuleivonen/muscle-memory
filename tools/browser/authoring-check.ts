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
    "/tmp/mm-eng354-worker",
  ],
  { stdio: "inherit" },
);
import { initializeLocalCatalog, repositorySeed } from "../authoring-local";
import { localSandboxValidator } from "../authoring-sandbox";
import { seedCatalog } from "../../packages/authoring/seed";
import { CatalogStorage } from "../../packages/authoring/storage";
import { AuthoringService } from "../../packages/authoring/service";
const legal = await readFile("apps/web/lib/legal.ts", "utf8");
assert.ok(
  legal.includes('LEGAL_VERSION = "2026-10-26.2"'),
  "review local consent fixture if Terms change",
);
const issuer = "https://eng354-fixture.cloudflareaccess.com";
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
const bundleDir = "/tmp/mm-eng354-worker";
const moduleFiles = (await readdir(bundleDir))
  .filter((n) => /\.(js|wasm|bin)$/.test(n))
  .sort((a, b) => (a === "worker.js" ? -1 : b === "worker.js" ? 1 : 0));
const mf = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        ...workerOptions,
        name: "muscle-memory",
        d1Databases: ["CATALOG_DB"],
        r2Buckets: ["CONTENT"],
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
          CATALOG_MODE: "managed",
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
    ...(extra.body ? { body: JSON.stringify(extra.body) } : {}),
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
let browser, sandbox, page;
let closing = false;
const routeErrors = [];
const root = resolve(".");
const mutation = (generation) => ({
  requestId: crypto.randomUUID(),
  expectedGeneration: generation,
});
try {
  await mf.ready;
  const db = await mf.getD1Database("CATALOG_DB");
  const bucket = await mf.getR2Bucket("CONTENT");
  await initializeLocalCatalog(root, db);
  const storage = new CatalogStorage(db, bucket),
    service = new AuthoringService(storage);
  const input = await repositorySeed(root);
  await seedCatalog(storage, input);
  const source = structuredClone(
    input.sources.find((s) => s.metadata.key === "JS-001"),
  );
  source.metadata.key = source.revision.challenge = "JS-998";
  source.metadata.title = "Synthetic browser draft";
  const authHeaders = {
    "content-type": "application/json",
    origin: "https://musclememory.run",
    "sec-fetch-site": "same-origin",
  };
  for (const token of [null, forged, wrong, expired])
    await check("/admin/api/challenges", token, 403, {
      method: "POST",
      headers: authHeaders,
      body: { ...mutation(0), source },
    });
  await check("/admin/api/challenges", valid, 403, {
    method: "POST",
    headers: { ...authHeaders, origin: "https://evil.test" },
    body: { ...mutation(0), source },
  });
  await check("/admin/api/challenges", valid, 403, {
    host: "preview.example.workers.dev",
  });
  await check("/admin/api/challenges", valid, 400, {
    method: "POST",
    headers: authHeaders,
    body: { ...mutation(0), source: {} },
  });
  let detail = JSON.parse(
    await check("/admin/api/challenges", valid, 200, {
      method: "POST",
      headers: authHeaders,
      body: { ...mutation(0), source },
    }),
  );
  await check("/api/challenges/JS-998/revisions/" + "a".repeat(64), null, 404);
  await check("/admin/api/challenges/JS-998/validation", valid, 400, {
    method: "POST",
    headers: authHeaders,
    body: { ...mutation(detail.head.generation), runs: [], passed: true },
  });
  await check("/admin/api/challenges/JS-998/validation/fake", valid, 400, {
    method: "POST",
    headers: authHeaders,
    body: { ...mutation(detail.head.generation), runs: [], passed: true },
  });
  await check("/admin/api/challenges/JS-998/publish", valid, 400, {
    method: "POST",
    headers: authHeaders,
    body: mutation(detail.head.generation),
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  let uploads = 0;
  await context.route("**/*", async (route) => {
    try {
      const incoming = route.request(),
        url = new URL(incoming.url());
      assert.equal(url.origin, "https://musclememory.run");
      if (url.pathname.startsWith("/_next/static/")) {
        const body = await readFile(
          resolve(
            "apps/web/.open-next/assets",
            "." + decodeURIComponent(url.pathname),
          ),
        );
        return await route.fulfill({
          status: 200,
          contentType: url.pathname.endsWith(".css")
            ? "text/css"
            : url.pathname.endsWith(".js")
              ? "application/javascript"
              : "application/octet-stream",
          body,
        });
      }
      if (url.pathname.startsWith("/ingest/")) {
        uploads++;
        return await route.fulfill({
          status: 503,
          body: "Synthetic QA upload blocked",
        });
      }
      const h = {
        ...incoming.headers(),
        host: url.host,
        "cf-access-jwt-assertion": valid,
      };
      if (h.origin) {
        h["x-eng353-local-origin"] = h.origin;
        delete h.origin;
      }
      const response = await mf.dispatchFetch(url.href, {
        method: incoming.method(),
        headers: h,
        ...(incoming.postDataBuffer()
          ? { body: incoming.postDataBuffer() }
          : {}),
        redirect: "manual",
      });
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      });
    } catch (error) {
      if (!closing) routeErrors.push(String(error));
      await route.abort().catch(() => {});
    }
  });
  page = await context.newPage();
  page.on("pageerror", (e) => routeErrors.push(String(e)));
  await page.goto("https://musclememory.run/admin/authoring/JS-998");
  await page
    .getByLabel("Title", { exact: true })
    .fill("Synthetic browser edited");
  await page
    .getByRole("button", { name: "Save private draft", exact: true })
    .click();
  await page
    .getByText("Private draft saved.", { exact: false })
    .waitFor({ timeout: 15000 });
  detail = await service.detail("JS-998");
  assert.equal(detail.source.metadata.title, "Synthetic browser edited");
  await page.getByRole("button", { name: "Queue trusted validation" }).click();
  await page.getByText("Validation queued.", { exact: false }).waitFor();
  assert.ok(
    await page
      .getByRole("button", { name: "Publish revision", exact: true })
      .isDisabled(),
  );
  detail = await service.detail("JS-998");
  assert.equal(detail.head.validation, "queued");
  const future = new AuthoringService(storage, () =>
    new Date(Date.now() + 86400000).toISOString(),
  );
  assert.equal((await future.detail("JS-998")).head.validation, "failed");
  sandbox = await localSandboxValidator(root);
  await service.runValidationJob(detail.head.validationJob, sandbox.validator);
  await page.reload();
  await page
    .getByRole("button", { name: "Publish revision", exact: true })
    .waitFor();
  assert.ok(
    await page
      .getByRole("button", { name: "Publish revision", exact: true })
      .isEnabled(),
  );
  await page
    .getByRole("button", { name: "Publish revision", exact: true })
    .click();
  await page.getByText("Published", { exact: false }).first().waitFor();
  detail = await service.detail("JS-998");
  assert.equal(detail.head.lifecycle, "published");
  assert.equal((await service.publicCatalog()).challenges.length, 70);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "/tmp/mm-eng354-authoring-mobile.png",
    fullPage: false,
  });
  const archiveButton = page.getByRole("button", {
    name: "Archive challenge",
    exact: true,
  });
  await archiveButton.click();
  await page.waitForFunction(() =>
    document.body.textContent.includes("archived"),
  );
  assert.equal((await service.detail("JS-998")).head.lifecycle, "archived");
  assert.equal((await service.publicCatalog()).challenges.length, 69);
  assert.equal(
    (await service.publicRevision("JS-998", detail.head.publishedRevision))
      .archived,
    true,
  );
  assert.equal(uploads, 0);
  assert.equal((await page.evaluate(() => indexedDB.databases())).length, 0);
  assert.deepEqual(routeErrors, []);
  console.log(
    JSON.stringify(
      {
        httpChecks: receipts.length,
        browser:
          "authenticated edit / queue / trusted execution / publish / archive / mobile; zero player uploads",
        receipts,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      error: String(error),
      httpChecks: receipts.length,
      routeErrors,
      body: page
        ? (await page.locator("body").innerText()).slice(0, 1800)
        : null,
    }),
  );
  if (page)
    await page
      .screenshot({
        path: "/tmp/mm-eng354-browser-failure.png",
        fullPage: false,
      })
      .catch(() => {});
  throw error;
} finally {
  closing = true;
  await sandbox?.dispose();
  await browser?.close();
  await mf.dispose();
}
