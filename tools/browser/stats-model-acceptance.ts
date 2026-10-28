/** AI comparison line, hydrated single-visit proof (development preview only).
 *   NEXT_PUBLIC_STATS_COMPARISON_PREVIEW=1 next dev -p 3396   (in apps/web), then
 *   STATS_ORIGIN=http://localhost:3396 node --import tsx tools/browser/stats-model-acceptance.ts
 *
 * The real Stats page; its evidence is the real producer (capture records seeded into the
 * browser's practice store, derived there). Two current challenges are solved: the newer has no
 * stored model runs, the older one stored run, projected by the real receipt projector
 * (`modelReceipt`) for that exact revision. Nothing is requested from production; no model call.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { LEGAL_VERSION } from "../../apps/web/lib/legal";
import { trace } from "../../packages/developer-profile/fixtures";
import { engineFor } from "../../packages/runner/engines";
import { canonical } from "../../packages/domain/json";
import { onRevision } from "../../packages/statistics/human-acceptance-fixture";
import { modelReceipt } from "../../packages/model-runs/receipts";
import { receiptText, slot } from "../../packages/model-runs/receipt-fixtures";
import catalog from "../../content/catalog.json" with { type: "json" };

const origin = process.env.STATS_ORIGIN ?? "http://localhost:3396";
const challenges = (catalog as { challenges: { key: string; revision: string; title: string }[] }).challenges;
const older = challenges.find((c) => c.key === "JS-001")!;
const newer = challenges.find((c) => c.key === "JS-002")!;
const runtime = engineFor("javascript")!.runtime;
const solve = (attempt: string, c: { key: string; revision: string }) =>
  trace(attempt, `${attempt}-source`, c.key, c.revision).map((r) => onRevision(r, c.revision, runtime));
// "a-…" sorts first among equal times: the newer task is the first candidate.
const device = [...solve("b-older", older), ...solve("a-newer", newer)];

/** One stored run of `older`, through the real projector, at the model's declared default. */
const stored = modelReceipt(
  { ...slot, condition: canonical({ reasoning: "high" }) },
  receiptText((os) => {
    for (const o of os) {
      o.challenge = older.key;
      o.challengeRevision = older.revision;
      if (o.type === "practice.opened") o.data.runtime = runtime;
    }
    const start = os.find((o) => o.type === "model.run-started");
    start.data.request = { model: slot.model, reasoning: { effort: "high" } };
    const last = os.filter((o) => o.type.startsWith("model.")).at(-1);
    os.push({
      ...last,
      type: "model.catalog",
      observationId: `${last.source.id}.${last.source.sequence + 1}`,
      source: { ...last.source, sequence: last.source.sequence + 1 },
      data: { at: "start", listing: { status: 200, entry: { id: slot.model, reasoning: { default_effort: "high" } } } },
    });
  }),
  older.key,
  older.revision,
);
assert.equal(stored.state, "completed", "the projector accepted the stored run");

const browser = await chromium.launch();
const errors: string[] = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
const receiptReads: string[] = [];
let leaked = 0;
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (/function |return |SYNTHETIC_PRIVATE/.test(`${decodeURIComponent(route.request().url())} ${route.request().postData() ?? ""}`)) leaked++;
  if (url.origin !== origin || url.pathname.includes("/ingest/")) return route.fulfill({ status: 503, body: "isolated-synthetic-qa" });
  if (url.pathname.startsWith("/api/private-history")) {
    const { window } = route.request().postDataJSON();
    return route.fulfill({ json: { attempts: [], unavailable: [], next: null, readAt: new Date().toISOString(), window, state: "ready" } }).catch(() => {});
  }
  if (url.pathname.startsWith("/api/cohort/")) return route.fulfill({ json: { state: "unavailable", groups: [] } }).catch(() => {});
  if (url.pathname.startsWith("/api/model-receipts/")) {
    receiptReads.push(decodeURIComponent(url.pathname));
    const receipts = url.pathname.includes(`/${older.key}/`) ? [stored] : []; // the newer task: none stored
    return route.fulfill({ json: { state: "ready", receipts, truncated: false, readAt: new Date().toISOString() } }).catch(() => {});
  }
  return route.continue();
});
await context.addCookies([{ name: "mm_consent", value: LEGAL_VERSION, url: origin }]);
await context.addInitScript(
  ([stored, rows]) => {
    if (location.origin === "null" || localStorage.getItem("qa-seeded")) return;
    localStorage.setItem("qa-seeded", "1");
    localStorage.setItem("muscle-memory.profile", stored as string);
    const r = indexedDB.open("muscle-memory-local-practice", 5);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore("settings");
      db.createObjectStore("records", { keyPath: "recordId" });
      db.createObjectStore("outbox", { autoIncrement: true });
    };
    r.onsuccess = () => {
      const tx = r.result.transaction(["settings", "records"], "readwrite");
      tx.objectStore("settings").put("synthetic-participant", "participantId");
      tx.objectStore("settings").put("synthetic-device-secret", "deviceSecret");
      for (const x of rows as object[]) tx.objectStore("records").put(x);
      tx.oncomplete = () => r.result.close();
    };
  },
  [
    JSON.stringify({ version: "2", createdAt: "2026-10-20T00:00:00.000Z", accepted: { version: LEGAL_VERSION, at: "2026-10-20T00:00:00.000Z" }, stealth: false, profile: {} }),
    device,
  ] as const,
);
const warm = await browser.newPage();
await warm.goto(`${origin}/stats`, { timeout: 180000 }).catch(() => {});
await warm.close();

const page = await context.newPage();
page.setDefaultTimeout(60000);
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
await page.goto(`${origin}/stats`);
await page.locator("#q-iterate").waitFor();
await page.evaluate(() => ((window as unknown as { __visit: number }).__visit = 1));
const line = page.locator('[data-comparison="model"]');
await line.waitFor({ timeout: 30000 });
const text = await line.innerText();
console.log(`  model line: ${text.replace(/\n/g, " | ")}`);
assert.match(text, new RegExp(`^AI models\\nOn ${older.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(current version, same runtime and diagnostics\\), synthetic/model solved it on its first try at its default setting\\. One observed run, not a success rate\\.$`));
assert.equal(await page.evaluate(() => (window as unknown as { __visit?: number }).__visit), 1, "same document, no reload");
assert.deepEqual(
  [...new Set(receiptReads)].sort(),
  [`/api/model-receipts/${newer.key}/${newer.revision}`, `/api/model-receipts/${older.key}/${older.revision}`].sort(),
  "each solved task read on its own, exact pairs only",
);
assert.equal(leaked, 0, "no request carried code");
console.log(`  ✓ shown for ${older.key} although the newer ${newer.key} has no stored runs; ${receiptReads.length} receipt reads; no reload`);

// Stealth from another tab: the line goes with the report, and no read starts after it.
const before = receiptReads.length;
const other = await context.newPage();
await other.goto(`${origin}/privacy`);
await other.evaluate(() => {
  const p = JSON.parse(localStorage.getItem("muscle-memory.profile")!);
  localStorage.setItem("muscle-memory.profile", JSON.stringify({ ...p, stealth: true }));
});
await page.getByText("You're in stealth, so there's no report here.").waitFor();
await page.waitForTimeout(3000);
assert.equal(await page.locator('[data-comparison="model"]').count(), 0);
assert.equal(receiptReads.length, before, "no receipt read after stealth");
console.log("  ✓ stealth removes the line and starts no read");
await browser.close();
assert.deepEqual([...new Set(errors)], [], "no console or page errors");
console.log("chromium: model acceptance passed");
