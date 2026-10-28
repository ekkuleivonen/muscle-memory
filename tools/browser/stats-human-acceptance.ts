/** ENG-376 human comparison, hydrated single-visit acceptance (development preview only).
 *   NEXT_PUBLIC_STATS_COMPARISON_PREVIEW=1 next dev -p 3396   (in apps/web), then
 *   STATS_ORIGIN=http://localhost:3396 node --import tsx tools/browser/stats-human-acceptance.ts
 *
 * The page is the real Stats page. Its evidence is the real producer: capture records seeded into
 * the browser's practice store, derived there by localHistory. `/api/cohort` is answered by the
 * real server function (`humanSummaryOnRequest`) over 20 eligible synthetic browsers, its Basin,
 * CONTROL, D1 and R2 bindings stood in by `human-acceptance-fixture.ts`; the build runs after the
 * reply, as waitUntil would. The revision's source comes from the local managed catalog copy and
 * never leaves this process. Nothing is requested from production.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, type Page } from "playwright";
import { LEGAL_VERSION } from "../../apps/web/lib/legal";
import { trace } from "../../packages/developer-profile/fixtures";
import { engineFor } from "../../packages/runner/engines";
import { many } from "../../packages/statistics/cohort-fixtures";
import { COHORT_VERSION, ELIGIBILITY, MIN_COHORT } from "../../packages/statistics/cohort";
import { humanEnvironment, onRevision } from "../../packages/statistics/human-acceptance-fixture";
import catalog from "../../content/catalog.json" with { type: "json" };

const origin = process.env.STATS_ORIGIN ?? "http://localhost:3396";
const KEY = "JS-001";
const PARTICIPANT = "synthetic-participant";
const meta = (catalog as { challenges: { key: string; revision: string }[] }).challenges.find((c) => c.key === KEY)!;
const revision = meta.revision;
const copy = JSON.parse(await readFile(".local/catalog-copy.json", "utf8")).catalog;
const source = copy.revisions[revision];
const metadata = copy.challenges.find((c: { key: string }) => c.key === KEY);
assert.ok(source && metadata, "the managed catalog copy has this revision");
const runtime = engineFor(source.language)!.runtime;
const device = trace("qa-human", "qa-human-source", KEY, revision).map((r) => onRevision(r, revision, runtime));

const browser = await chromium.launch();
const errors: string[] = [];
const log: string[] = [];
const step = (s: string) => (log.push(s), console.log(`  ✓ ${s}`));

/** A fresh browser with the device's records and an adult, non-stealth profile, and the backend. */
async function visit(browsers: number) {
  const f = humanEnvironment({
    events: many(browsers).map((e) => onRevision(e, revision, runtime)),
    challenge: KEY,
    revision,
    source,
    metadata,
    runtime,
  });
  const background: Promise<unknown>[] = [];
  const cohortReads: string[] = [];
  const modelReads: string[] = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.includes("/ingest/")) return route.fulfill({ status: 503, body: "isolated-synthetic-qa" });
    // Models are off (MODEL_FYI_ENABLED false). Without the dev preview switch no receipt is ever
    // requested; with it, receipts are answered unavailable so no model line can appear here.
    if (url.pathname.startsWith("/api/model-receipts/")) {
      modelReads.push(url.pathname);
      return route.fulfill({ json: { state: "unavailable", receipts: [] } }).catch(() => {});
    }
    if (url.pathname.startsWith("/api/private-history")) {
      const { window } = route.request().postDataJSON();
      return route.fulfill({ json: { attempts: [], unavailable: [], next: null, readAt: new Date().toISOString(), window, state: "ready" } }).catch(() => {});
    }
    if (url.pathname.startsWith("/api/cohort/")) {
      cohortReads.push(url.pathname);
      assert.equal(url.pathname, `/api/cohort/${encodeURIComponent(KEY)}/${encodeURIComponent(revision)}`, "only the exact pair");
      // The route's own answer: the served snapshot, or "unavailable" with the build after it.
      const read = await f.request(new Date(), (w) => background.push(w));
      const body = read ?? { state: "unavailable", version: COHORT_VERSION, minimum: MIN_COHORT, eligibility: ELIGIBILITY, readAt: new Date().toISOString(), groups: [] };
      assert.doesNotMatch(JSON.stringify(body), /participant_id|synthetic-token|"b\d+"/, "aggregate-only reply");
      return route.fulfill({ json: body, headers: { "cache-control": "no-store" } }).catch(() => {});
    }
    return route.continue();
  });
  await context.addCookies([{ name: "mm_consent", value: LEGAL_VERSION, url: origin }]);
  await context.addInitScript(
    ([stored, rows, participant]) => {
      if (location.origin === "null" || localStorage.getItem("muscle-memory.qa-seeded")) return;
      localStorage.setItem("muscle-memory.qa-seeded", "1");
      localStorage.setItem("muscle-memory.profile", stored as string);
      const request = indexedDB.open("muscle-memory-local-practice", 5);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("settings");
        db.createObjectStore("records", { keyPath: "recordId" });
        db.createObjectStore("outbox", { autoIncrement: true });
      };
      request.onsuccess = () => {
        const tx = request.result.transaction(["settings", "records"], "readwrite");
        tx.objectStore("settings").put(participant, "participantId");
        tx.objectStore("settings").put("synthetic-device-secret", "deviceSecret");
        for (const r of rows as object[]) tx.objectStore("records").put(r);
        tx.oncomplete = () => request.result.close();
      };
    },
    [
      JSON.stringify({
        version: "2",
        createdAt: "2026-10-20T00:00:00.000Z",
        accepted: { version: LEGAL_VERSION, at: "2026-10-20T00:00:00.000Z" },
        stealth: false,
        profile: { age: "25-34" },
        asked: { age: { answeredAt: "2026-10-20T00:00:00.000Z" } },
      }),
      device,
      PARTICIPANT,
    ] as const,
  );
  const page: Page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  return { f, page, context, cohortReads, modelReads, background };
}

// Compile the page once, outside the visits under test.
{
  const warm = await browser.newPage();
  await warm.goto(`${origin}/stats`, { timeout: 180000 }).catch(() => {});
  await warm.close();
}

// 20 eligible browsers, cold cache: one visit, no reload, the line appears.
{
  const v = await visit(20);
  await v.page.goto(`${origin}/stats`);
  await v.page.locator("#q-iterate").waitFor();
  // A marker in this document: it survives only if the page is never reloaded.
  await v.page.evaluate(() => ((window as unknown as { __visit: number }).__visit = 1));
  assert.equal(await v.page.locator('[data-comparison="human"]').count(), 0, "personal answers first; the cold cache has no line yet");
  const human = v.page.locator('[data-comparison="human"]');
  await human.waitFor({ timeout: 45000 });
  assert.match(
    await human.innerText(),
    /^Other players\nAmong first attempts at .+ \(current version, same runtime and editor setup\) from 20–49 browsers, about \d+% of scored first submissions passed\.$/,
  );
  await Promise.all(v.background);
  assert.equal(
    await v.page.evaluate(() => (window as unknown as { __visit?: number }).__visit),
    1,
    "a single visit: the same document throughout, never reloaded",
  );
  assert.equal(await v.page.locator('[data-comparison="model"]').count(), 0, "no model line");
  assert.ok(v.cohortReads.length >= 2, `warmup re-read the cohort (${v.cohortReads.length} reads)`);
  assert.equal(v.f.queries, 1, "one member query");
  step(`model receipts requested: ${v.modelReads.length}`);
  step(`20 browsers, cold cache: line shown in the same visit after ${v.cohortReads.length} reads, 1 query, no reload`);
  await v.context.close();
  v.f.close();
}

// 19 browsers: the build finds too few; the visit says so and shows no line.
{
  const v = await visit(19);
  await v.page.goto(`${origin}/stats`);
  await v.page.locator("#q-iterate").waitFor();
  await v.page.locator(".report-discover .report-note", { hasText: "at least 20 comparable adults" }).waitFor({ timeout: 45000 });
  assert.equal(await v.page.locator('[data-comparison="human"]').count(), 0);
  await Promise.all(v.background);
  assert.equal(v.f.queries, 1, "one query, not retried within the hour");
  step("19 browsers: too-few note, no line, one query");
  await v.context.close();
  v.f.close();
}

// A private boundary during warmup: no further cohort read starts.
{
  const v = await visit(20);
  await v.page.goto(`${origin}/stats`);
  await v.page.locator("#q-iterate").waitFor();
  await v.page.waitForTimeout(1000);
  const reads = v.cohortReads.length;
  await v.page.evaluate(() => window.dispatchEvent(new CustomEvent("muscle-memory:private-boundary", { detail: "start" })));
  await v.page.waitForTimeout(6000);
  assert.equal(v.cohortReads.length, reads, "warmup reads stop at a private boundary");
  assert.equal(await v.page.locator('[data-comparison="human"]').count(), 0);
  step("a private boundary during warmup stops further reads");
  await Promise.all(v.background);
  await v.context.close();
  v.f.close();
}

await browser.close();
assert.deepEqual([...new Set(errors)], [], "no console or page errors");
console.log(`chromium: ${log.length} acceptance checks passed`);
