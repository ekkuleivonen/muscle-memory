/** ENG-374 synthetic acceptance: the /stats portrait from empty to a rich history.
 * STATS_ORIGIN=http://localhost:3080 STATS_BROWSER=chromium|webkit node --import tsx tools/browser/stats-portrait-check.ts
 * Every context is fresh and synthetic: a seeded profile and fixture attempts in IndexedDB, paced
 * and dated differently so the report has something to say. Requests off the origin and ingest are
 * stopped in the browser; uploaded history is a synthetic empty page, a slow page or a 503, never
 * sent. Device emulation, not real devices. Needs content/catalog.json for live revisions.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit, type BrowserContext, type Page } from "playwright";
import { LEGAL_VERSION } from "../../apps/web/lib/legal";
import { trace } from "../../packages/developer-profile/fixtures";
import type { StoredRecord } from "../../packages/domain/records";
import catalog from "../../content/catalog.json" with { type: "json" };

const origin = process.env.STATS_ORIGIN ?? "http://localhost:3080";
const engine = process.env.STATS_BROWSER ?? "chromium";
assert.ok(engine === "chromium" || engine === "webkit");
const output = process.env.STATS_ARTIFACTS ?? `${process.env.HOME}/Code/.worktrees/eng374-qa`;
await mkdir(output, { recursive: true });
const revision = (key: string) => (catalog as { challenges: { key: string; revision: string }[] }).challenges.find((c) => c.key === key)!.revision;
const PARTICIPANT = "synthetic-participant";
const DAY = 86_400_000;

/**
 * The fixture trace, slowed by `pace` (gaps stay under the 30 s active gap up to 7×), started
 * `day` days in, with its after-solve confidence answer replaced.
 */
function attempt(key: string, day: number, pace: number, confidence: string): StoredRecord[] {
  const base = Date.parse("2026-10-20T09:00:00Z") + day * DAY;
  return trace(`qa-${key}`, `qa-${key}-source`, key, revision(key)).map((r) => {
    const o = JSON.parse(r.payload);
    o.elapsedMs *= pace;
    o.occurredAt = new Date(base + o.elapsedMs).toISOString();
    if (o.type === "practice.keys") o.data.keys = o.data.keys.map((k: unknown[]) => [(k[0] as number) * pace, ...k.slice(1)]);
    if (o.type === "practice.answered") o.data.answer = confidence;
    return { ...r, payload: JSON.stringify(o) };
  });
}
const HISTORIES: Record<string, StoredRecord[]> = {
  empty: [],
  one: attempt("JS-001", 0, 4, "unsure"),
  two: [...attempt("JS-001", 0, 6, "unsure"), ...attempt("JS-002", 1, 3, "sure")],
  rich: [
    ...attempt("JS-001", 0, 7, "unsure"),
    ...attempt("JS-002", 1, 6, "sure"),
    ...attempt("JS-003", 3, 3, "sure"),
    ...attempt("JS-004", 5, 2, "fairly"),
    ...attempt("JS-005", 6, 5, "guessing"),
    ...attempt("PY-001", 8, 4, "unsure"),
  ],
};

type Device = { name: string; width: number; height: number; touch: boolean };
const DEVICES: Device[] = [
  { name: "desktop-1280", width: 1280, height: 800, touch: false },
  { name: "phone-390", width: 390, height: 844, touch: true },
  { name: "phone-320", width: 320, height: 640, touch: true },
  { name: "phone-landscape", width: 844, height: 390, touch: true },
];
type History = "empty-page" | "slow" | "down";

const browser = await (engine === "webkit" ? webkit : chromium).launch();
let blocked = 0;
const log: string[] = [];
const timings: Record<string, number> = {};
const step = (s: string) => {
  log.push(s);
  console.log(`  ✓ ${s}`);
};

async function open(
  device: Device,
  rows: StoredRecord[],
  o: { history?: History; stealth?: boolean; init?: string } = {},
): Promise<{ context: BrowserContext; page: Page; reads: () => number }> {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    hasTouch: device.touch,
    isMobile: device.touch && engine === "chromium",
  });
  let reads = 0;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.includes("/ingest/")) {
      blocked++;
      return route.fulfill({ status: 503, body: "isolated-synthetic-qa" });
    }
    if (url.pathname.startsWith("/api/private-history")) {
      reads++;
      const history = o.history ?? "empty-page";
      if (history === "down") return route.fulfill({ status: 503, body: "" });
      if (history === "slow") await new Promise((done) => setTimeout(done, 6000));
      const { window } = route.request().postDataJSON();
      return route.fulfill({ json: { attempts: [], unavailable: [], next: null, readAt: new Date().toISOString(), window, state: "absent" } }).catch(() => {});
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
        // A placeholder so the report asks for uploads; the browser answers that request itself.
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
        stealth: o.stealth ?? false,
        profile: {},
      }),
      rows,
      PARTICIPANT,
    ] as const,
  );
  if (o.init) await context.addInitScript(o.init);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  return { context, page, reads: () => reads };
}

/** Opens /stats until the seeded records are read (IndexedDB seeding lands asynchronously). */
async function report(page: Page, ready: string) {
  for (let i = 0; i < 3; i++) {
    const began = Date.now();
    await page.goto(`${origin}/stats`);
    if (await page.locator(ready).first().waitFor({ timeout: 8000 }).then(() => true, () => false)) return Date.now() - began;
  }
  throw new Error(`${ready} never rendered`);
}
async function noOverflow(page: Page, where: string) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}: no sideways scroll`);
}
const text = (page: Page) => page.locator(".stats-content").innerText();
const FORBIDDEN = /sha256|revision|harness|receipt|percentile|cohort|evidence|reading time|thinking|undefined|NaN|null/i;

for (const device of DEVICES) {
  console.log(`${engine} ${device.name}`);
  const shot = (page: Page, name: string) => page.screenshot({ path: `${output}/${engine}-${device.name}-${name}.png`, fullPage: true });

  // Empty: one line and a start, no cards.
  {
    const { context, page } = await open(device, HISTORIES.empty);
    await report(page, "text=Your portrait starts with one challenge.");
    assert.equal(await page.locator(".report-question, .report-takeaways").count(), 0);
    await page.getByRole("link", { name: /Pick a language and start/ }).waitFor();
    await noOverflow(page, "empty");
    await shot(page, "1-empty");
    step(`${device.name}: empty report is one line and a start`);
    await context.close();
  }

  // One solve: describes that solve, no takeaways, a next challenge in its language.
  {
    const { context, page } = await open(device, HISTORIES.one);
    await report(page, "#q-iterate");
    const body = await text(page);
    assert.equal(await page.locator(".report-takeaways").count(), 0, "one solve has nothing to sum up");
    assert.match(body, /This solve took 2 submissions; the first didn't pass\./);
    assert.match(body, /Your first edit came \d+ s in, then \d+ s of active work to the solve\./);
    assert.match(body, /All JavaScript so far: 1 challenge solved\./);
    assert.doesNotMatch(body, /typically|Mostly|Has your pace changed/);
    assert.doesNotMatch(body, FORBIDDEN);
    assert.match(await page.locator(".report-action").innerText(), /^Next: JS-/);
    await noOverflow(page, "one solve");
    await shot(page, "2-one");
    step(`${device.name}: one solve describes that solve; next stays in JavaScript`);
    await context.close();
  }

  // Two solves: scoped observations ("Across your two…"), the next JavaScript challenge.
  {
    const { context, page } = await open(device, HISTORIES.two);
    await report(page, "#q-progress");
    const body = await text(page);
    assert.match(body, /Across your two easy JavaScript challenges, the second took \d+ s of active work; the first took \d+ s\./);
    assert.match(body, /Across your two solves, each took 2 submissions\./);
    assert.doesNotMatch(body, /typically|Mostly|You iterate|You're getting/);
    assert.doesNotMatch(body, FORBIDDEN);
    assert.match(await page.locator(".report-action").innerText(), /^Next: JS-003 · /);
    assert.ok(await page.locator(".report-takeaways li").count() <= 3);
    await noOverflow(page, "two solves");
    await shot(page, "3-two");
    step(`${device.name}: two solves are scoped, never a trait; next is JS-003, not C-001`);
    await context.close();
  }

  // Rich: a few takeaways that lead to their answers; history slow and not blocking.
  {
    const { context, page, reads } = await open(device, HISTORIES.rich, { history: "slow" });
    const ms = await report(page, "#q-progress");
    timings[`${device.name} rich: first answer with history pending`] = ms;
    assert.ok(ms < 6000, `the report rendered before the 6 s history reply (${ms} ms)`);
    await page.locator(".report-status", { hasText: "Adding your earlier practice" }).waitFor();
    for (let i = 0; i < 50 && !reads(); i++) await page.waitForTimeout(100);
    assert.ok(reads() >= 1, "history was requested while the report was already shown");
    const takeaways = page.locator(".report-takeaways li a");
    const n = await takeaways.count();
    assert.ok(n >= 2 && n <= 3, `two or three takeaways (${n})`);
    for (let i = 0; i < n; i++) {
      const href = (await takeaways.nth(i).getAttribute("href"))!;
      assert.equal(await page.locator(href).count(), 1, `${href} answer exists`);
    }
    const body = await text(page);
    assert.match(body, /You're getting faster at easy JavaScript|Your recent easy JavaScript solves took longer|Steady at easy JavaScript/);
    assert.match(body, /Does your confidence match the result\?/);
    assert.match(body, /When you felt sure, your first submission passed \d of \d times; when unsure, \d of \d\./);
    assert.match(body, /Mostly JavaScript \(5 solved\), then Python \(1 solved\)\./);
    assert.doesNotMatch(body, FORBIDDEN);
    assert.equal(await page.locator(".report-fyi", { hasText: /models/ }).count(), 0, "no model receipts in this synthetic run, so no FYI");
    await noOverflow(page, "rich");
    await shot(page, "4-rich");
    if (!device.touch) {
      // Keyboard: the first Tab stops in the page reach the first takeaway; Enter moves to its answer.
      await page.locator(".report-takeaways a").first().focus();
      const target = (await page.locator(".report-takeaways a").first().getAttribute("href"))!;
      await page.keyboard.press("Enter");
      await page.waitForURL(new RegExp(`${target}$`));
      assert.ok(await page.locator(target).evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= -2 && r.top < innerHeight; }), "answer scrolled into view");
      step(`${device.name}: Enter on a takeaway lands on its answer (${target})`);
    }
    await page.locator(".report-status").waitFor({ state: "detached", timeout: 15000 });
    step(`${device.name}: rich history leads with ${n} takeaways; history arrived later without blocking (${ms} ms to first answer)`);
    await context.close();
  }

  // Uploads unavailable: the device report stays; a short retrying line.
  {
    const { context, page } = await open(device, HISTORIES.two, { history: "down" });
    await report(page, "#q-progress");
    await page.locator(".report-status", { hasText: "trying again shortly" }).waitFor();
    assert.equal(await page.locator("#q-iterate").count(), 1);
    await shot(page, "5-history-down");
    step(`${device.name}: uploads down keeps the device report with a retrying line`);
    await context.close();
  }

  // Practice records unreadable: says so, changes nothing.
  {
    const { context, page } = await open(device, HISTORIES.two, {
      init: `IDBFactory.prototype.open = () => { throw new DOMException("Synthetic: storage blocked", "SecurityError"); };`,
    });
    await page.goto(`${origin}/stats`);
    await page.getByText(/Some saved practice couldn't be read\.|Your practice couldn't be read on this browser\./).first().waitFor();
    await noOverflow(page, "storage error");
    await shot(page, "6-storage-error");
    step(`${device.name}: unreadable practice records say so`);
    await context.close();
  }

  // Stealth: no report, no history read.
  {
    const { context, page, reads } = await open(device, HISTORIES.rich, { stealth: true });
    await page.goto(`${origin}/stats`);
    await page.getByText("You're in stealth, so there's no report here.").waitFor();
    await page.waitForTimeout(500);
    assert.equal(reads(), 0, "stealth reads no history");
    assert.equal(await page.locator(".report-question").count(), 0);
    step(`${device.name}: stealth shows no report and reads nothing`);
    await context.close();
  }
}

await browser.close();
await writeFile(`${output}/${engine}-results.json`, JSON.stringify({ engine, blocked, timings, steps: log }, null, 2));
console.log(`${engine}: ${log.length} checks passed; ${blocked} off-origin requests stopped, none sent`);
console.log(timings);
