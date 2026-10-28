/** ENG-394 comparison bridge, synthetic browser flow (development preview only).
 * NEXT_PUBLIC_STATS_COMPARISON_PREVIEW=1 next dev, then
 * STATS_ORIGIN=http://localhost:3395 node --import tsx tools/browser/stats-comparisons-check.ts
 *
 * Every reply is synthetic and answered inside the browser: cohort summaries and model receipts
 * built like ENG-376's tests, and one uploaded-history summary. Nothing leaves the machine. The
 * uploaded summary is the device's own derived attempt marked `practice: "first"`, because derive
 * doesn't emit "first" yet (reported to ENG-376); without it neither helper has a candidate.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "playwright";
import { LEGAL_VERSION } from "../../apps/web/lib/legal";
import { trace } from "../../packages/developer-profile/fixtures";
import { deriveAttempts } from "../../packages/developer-profile/derive";
import { cohortResult } from "../../packages/statistics/cohort";
import { receiptMatch, type ModelReceipt } from "../../packages/model-runs/receipts";
import type { StoredRecord } from "../../packages/domain/records";
import catalog from "../../content/catalog.json" with { type: "json" };

const origin = process.env.STATS_ORIGIN ?? "http://localhost:3395";
const output = process.env.STATS_ARTIFACTS ?? `${process.env.HOME}/Code/.worktrees/eng-394-bridge-qa`;
await mkdir(output, { recursive: true });
const KEY = "JS-001";
const revision = (catalog as { challenges: { key: string; revision: string }[] }).challenges.find((c) => c.key === KEY)!.revision;
const PARTICIPANT = "synthetic-participant";
const records: StoredRecord[] = trace("qa-cmp", "qa-cmp-source", KEY, revision);
const derived = deriveAttempts(records, PARTICIPANT)[0];
assert.ok(derived?.completed, "the fixture attempt is solved");
const runtime = JSON.parse(derived.conditions.find((c) => c.startsWith("Runtime: "))!.slice(9));
const editorLine = derived.conditions.find((c) => c.startsWith("Editor: "))!.slice(8);
const [editorName, features] = editorLine.split("; features: ");
const editor = { name: editorName, features: features.split(", ").sort() };
const diagnostics = editor.features.includes("type-diagnostics");

/** Aggregated rows for the attempt's exact setup: `passed` browsers passed a scored first submission. */
const cohort = (passed: number, failed: number) =>
  cohortResult(
    [
      [1, passed],
      [0, failed],
    ].map(([first_pass, browsers]) => ({
      runtime: JSON.stringify(Object.fromEntries(Object.entries(runtime).sort(([a], [b]) => a.localeCompare(b)))),
      editor: JSON.stringify(editor),
      diagnostics: diagnostics ? 1 : 0,
      practice: "first",
      completed: 1,
      first_pass,
      submissions: 2,
      browsers,
    })),
  );
const receipt = (model: string, over: Partial<ModelReceipt> = {}): ModelReceipt => ({
  model,
  reportedModels: [model],
  reasoning: "default",
  defaultReasoning: "default",
  finalCodeLength: 300,
  harness: "synthetic",
  try: 1,
  state: "completed",
  submissions: 1,
  runtime,
  features: ["edit-code-tool", ...(diagnostics ? ["type-diagnostics"] : [])],
  budget: { turns: 50, submissions: 10 },
  ...over,
});
const MATCHED = [receipt("synthetic/a", { finalCodeLength: 280 }), receipt("synthetic/b", { finalCodeLength: 340 }), receipt("synthetic/c", { state: "stopped", finalCodeLength: null }), receipt("synthetic/d", { finalCodeLength: 410 })];
assert.ok(MATCHED.every((r) => receiptMatch(r, derived.conditions) === "matched"), "synthetic receipts match the attempt's setup");
const UNMATCHED = MATCHED.map((r) => ({ ...r, runtime: { ...runtime, version: "other" } }));

type Device = { name: string; width: number; height: number; touch: boolean };
const DEVICES: Device[] = [
  { name: "desktop-1280", width: 1280, height: 800, touch: false },
  { name: "phone-390", width: 390, height: 844, touch: true },
  { name: "phone-320", width: 320, height: 640, touch: true },
  { name: "phone-landscape", width: 844, height: 390, touch: true },
];
type Reply = { cohort?: "ok" | "few" | "down"; cohortDelay?: number; receipts?: "ok" | "unmatched"; age?: string };

const browser = await chromium.launch();
const errors: string[] = [];
let leaked = 0;
const log: string[] = [];
const step = (s: string) => {
  log.push(s);
  console.log(`  ✓ ${s}`);
};

async function open(device: Device, o: Reply = {}) {
  const context: BrowserContext = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    hasTouch: device.touch,
    isMobile: device.touch,
    reducedMotion: "reduce",
  });
  const asked: string[] = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    // No request carries code or the passing-code text.
    if (/function |return |synthetic code/.test(`${decodeURIComponent(request.url())} ${request.postData() ?? ""}`)) leaked++;
    if (url.origin !== origin || url.pathname.includes("/ingest/")) return route.fulfill({ status: 503, body: "isolated-synthetic-qa" });
    if (url.pathname.startsWith("/api/cohort/")) {
      asked.push(url.pathname);
      if (o.cohortDelay) await new Promise((done) => setTimeout(done, o.cohortDelay));
      if (o.cohort === "down") return route.fulfill({ status: 503, json: { error: "synthetic" } }).catch(() => {});
      return route.fulfill({ json: o.cohort === "few" ? cohort(5, 6) : cohort(9, 11) }).catch(() => {});
    }
    if (url.pathname.startsWith("/api/model-receipts/")) {
      asked.push(url.pathname);
      return route.fulfill({ json: { state: "ready", receipts: o.receipts === "unmatched" ? UNMATCHED : MATCHED } });
    }
    if (url.pathname.startsWith("/api/private-history")) {
      const { window } = request.postDataJSON();
      // The device's own attempt, as the helpers' "first" practice and a moment later.
      const first = { ...derived, practice: "first", last: new Date(Date.parse(derived.last) + 1000).toISOString() };
      return route.fulfill({ json: { attempts: [first], unavailable: [], next: null, readAt: new Date().toISOString(), window, state: "ready" } }).catch(() => {});
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
        profile: o.age ? { age: o.age } : {},
        ...(o.age ? { asked: { age: { answeredAt: "2026-10-20T00:00:00.000Z" } } } : {}),
      }),
      records,
      PARTICIPANT,
    ] as const,
  );
  const page: Page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  return { context, page, asked };
}
async function report(page: Page, ready: string) {
  for (let i = 0; i < 3; i++) {
    await page.goto(`${origin}/stats`);
    if (await page.locator(ready).first().waitFor({ timeout: 8000 }).then(() => true, () => false)) return;
  }
  throw new Error(`${ready} never rendered`);
}
const whole = async (page: Page, device: Device, name: string) => {
  const height = await page.evaluate(() => document.querySelector(".stats-content")!.scrollHeight + 160);
  await page.setViewportSize({ width: device.width, height: Math.max(device.height, height) });
  await page.screenshot({ path: `${output}/${device.name}-${name}.png` });
  await page.setViewportSize({ width: device.width, height: device.height });
};
const noOverflow = async (page: Page, where: string) =>
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}: no sideways scroll`);
const exact = (asked: string[]) => {
  const pair = `${encodeURIComponent(KEY)}/${encodeURIComponent(revision)}`;
  assert.ok(asked.length > 0 && asked.every((p) => p.endsWith(pair)), `only the exact pair is asked for (${asked.join(", ")})`);
};

for (const device of DEVICES) {
  console.log(`chromium ${device.name}`);

  // Both lines, an adult viewer: the personal answers render before the slow cohort reply.
  {
    const { context, page, asked } = await open(device, { age: "25-34", cohortDelay: 2500 });
    await report(page, "#q-iterate");
    assert.equal(await page.locator('[data-comparison="human"]').count(), 0, "personal answers never wait on comparisons");
    const human = page.locator('[data-comparison="human"]');
    await human.waitFor();
    assert.match(await human.innerText(), /^Other players\nAmong first attempts at .+ \(current version, same runtime and editor setup\) from 20–49 browsers, about 45% of scored first submissions passed\.$/);
    const model = page.locator('[data-comparison="model"]');
    await model.waitFor();
    assert.match(await model.innerText(), /^AI models\nOn .+ \(current version, same runtime and diagnostics\), (your passing code was \d+ characters; 3 of 4 models solved it on their first try at their default setting, with a median of 340\. Counts include whitespace; length isn't a score\.|3 of 4 models solved it on their first try at their default setting\. One try each, not a success rate\.)$/);
    assert.equal(await page.locator(".report-question .report-compared, .report-first .report-compared").count(), 0, "under the answers, never inside one");
    assert.doesNotMatch(await page.locator(".report-discover").innerText(), /Other players|AI models/, "no omission note for a line that's shown");
    exact(asked);
    await noOverflow(page, "both");
    await whole(page, device, "1-both-lines");
    step(`${device.name}: both named-task lines after the answers, personal answers first, exact pair only`);

    // A simulated private-boundary start (as reset, import or deletion send): no new comparison
    // read starts while it lasts, and nothing shown comes back.
    const before = asked.length;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("muscle-memory:private-boundary", { detail: "start" })));
    await page.waitForTimeout(1500);
    assert.equal(asked.length, before, `no comparison read after the boundary started (${asked.slice(before).join(", ")})`);
    assert.equal(await page.locator(".report-compared").count(), 0);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("muscle-memory:private-boundary", { detail: "finish" })));
    await page.locator("#q-iterate").waitFor();
    await page.waitForTimeout(1500);
    step(`${device.name}: no comparison read while a simulated private boundary is open`);

    // Stealth from another tab: report and lines gone, and no read after it.
    const atStealth = asked.length;
    const other = await context.newPage();
    await other.goto(`${origin}/privacy`);
    await other.evaluate(() => {
      const p = JSON.parse(localStorage.getItem("muscle-memory.profile")!);
      localStorage.setItem("muscle-memory.profile", JSON.stringify({ ...p, stealth: true }));
    });
    await page.getByText("You're in stealth, so there's no report here.").waitFor();
    assert.equal(await page.locator(".report-compared").count(), 0);
    assert.doesNotMatch(await page.content(), /scored first submissions|models solved it/);
    await page.waitForTimeout(1500);
    assert.equal(asked.slice(atStealth).filter((p) => p.startsWith("/api/cohort/")).length, 0, "no cohort read after stealth");
    assert.equal(asked.slice(atStealth).length, 0, "no comparison read of any kind after stealth");
    step(`${device.name}: stealth from another tab removes the lines with the report and starts no read`);
    await context.close();
  }

  // Age not answered, model runs in another setup: honest notes, the optional age step.
  {
    const { context, page } = await open(device, { receipts: "unmatched" });
    await report(page, "#q-iterate");
    const notes = page.locator(".report-discover .report-note");
    await notes.filter({ hasText: "comparisons are between adults" }).waitFor();
    await notes.filter({ hasText: "no stored model run used the same runtime and diagnostics setting" }).waitFor();
    assert.equal(await page.locator(".report-compared").count(), 0);
    assert.equal(await page.getByRole("link", { name: /Add your age band \(optional\)/ }).getAttribute("href"), "/settings/profile/age?from=stats-comparisons");
    await noOverflow(page, "notes");
    await whole(page, device, "2-age-missing-unmatched");
    step(`${device.name}: age unanswered and unmatched models say why, with the optional age step`);
    await context.close();
  }

  // Too few players, adult viewer: the threshold and the settings check; the model line still shows.
  {
    const { context, page } = await open(device, { age: "25-34", cohort: "few" });
    await report(page, "#q-iterate");
    await page.locator('[data-comparison="model"]').waitFor();
    const few = page.locator(".report-discover .report-note", { hasText: "at least 20 comparable adults" });
    await few.waitFor();
    assert.equal(await few.getByRole("link").getAttribute("href"), "/settings/privacy");
    await whole(page, device, "3-too-few-players");
    step(`${device.name}: too few players names the threshold and offers the settings check`);
    await context.close();
  }

  // A private boundary while the cohort reply is in flight: the late reply never shows.
  {
    const { context, page, asked } = await open(device, { age: "25-34", cohortDelay: 3000 });
    await report(page, "#q-iterate");
    await page.waitForTimeout(500);
    const inFlight = asked.length;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("muscle-memory:private-boundary", { detail: "start" })));
    await page.waitForTimeout(300);
    assert.equal(asked.length, inFlight, "the boundary start itself starts no read");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("muscle-memory:private-boundary", { detail: "finish" })));
    await page.locator("#q-iterate").waitFor();
    // The reply in flight before the boundary lands about 2.2 s after it finishes; the fresh read
    // the finished boundary allows lands at 3 s. Between the two, nothing may show.
    await page.waitForTimeout(2600);
    assert.equal(await page.locator('[data-comparison="human"]').count(), 0, "the reply that was in flight is discarded");
    step(`${device.name}: a cohort reply in flight across a private boundary is discarded`);
    await context.close();
  }

  // Cohort service down: says so, no stale or invented line.
  {
    const { context, page } = await open(device, { age: "25-34", cohort: "down" });
    await report(page, "#q-iterate");
    await page.locator(".report-discover .report-note", { hasText: "Other players' results aren't available right now." }).waitFor();
    assert.equal(await page.locator('[data-comparison="human"]').count(), 0);
    step(`${device.name}: an unavailable cohort says so`);
    await context.close();
  }
}

await browser.close();
assert.equal(leaked, 0, "no request carried code");
assert.deepEqual([...new Set(errors)], [], "no console or page errors");
console.log(`chromium: ${log.length} checks passed`);
