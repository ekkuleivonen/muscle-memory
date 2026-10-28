/** ENG-374 synthetic acceptance: the /stats portrait from empty to a rich history.
 * STATS_ORIGIN=http://localhost:3080 STATS_BROWSER=chromium|webkit node --import tsx tools/browser/stats-portrait-check.ts
 * ENG-394 adds the visuals and the share preview: copy, Web Share (stubbed, never opened),
 * download, Clipboard and Web Share missing, repeated presses, stealth, a private boundary and
 * Back while it is open. Nothing is shared for real.
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
function attempt(key: string, day: number, pace: number, confidence: string, again = ""): StoredRecord[] {
  const base = Date.parse("2026-10-20T09:00:00Z") + day * DAY;
  return trace(`qa-${key}${again}`, `qa-${key}${again}-source`, key, revision(key)).map((r) => {
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
    // Back on JS-001 later: a repeat, never part of the earlier/later comparison.
    ...attempt("JS-001", 9, 3, "sure", "-again"),
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
let leaked = 0;
/** Console errors and page errors, other than the synthetic 503s this check serves on purpose. */
const errors: string[] = [];
// The report shows no model comparison, so it must not ask for model results either.
let receiptReads = 0;
const log: string[] = [];
const timings: Record<string, number> = {};
const step = (s: string) => {
  log.push(s);
  console.log(`  ✓ ${s}`);
};

async function open(
  device: Device,
  rows: StoredRecord[],
  o: { history?: History; stealth?: boolean; init?: string; languages?: string[] } = {},
): Promise<{ context: BrowserContext; page: Page; reads: () => number }> {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    hasTouch: device.touch,
    isMobile: device.touch && engine === "chromium",
    // Settled pixels: the bars' grow animation is off, so screenshots show their real lengths.
    reducedMotion: "reduce",
    // A real clipboard to read the copy back from (Chromium); nothing leaves the machine.
    permissions: engine === "chromium" ? ["clipboard-read", "clipboard-write"] : [],
  });
  let reads = 0;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    // The share summary never leaves the browser: no request carries it.
    if (/unaided coding practice|challenges? solved/i.test(`${decodeURIComponent(route.request().url())} ${route.request().postData() ?? ""}`)) leaked++;
    if (url.pathname.startsWith("/api/model-receipts")) receiptReads++;
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
        profile: o.languages ? { languages: o.languages } : {},
        ...(o.languages ? { asked: { languages: { answeredAt: "2026-10-20T00:00:00.000Z" } } } : {}),
      }),
      rows,
      PARTICIPANT,
    ] as const,
  );
  if (o.init) await context.addInitScript(o.init);
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|Synthetic: storage blocked/.test(m.text())) errors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
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

type Clip = {
  state: () => { pending: number; fallbacks: number; textareas: number };
  settle: (how: "reject" | "resolve", which: number) => void;
  resetTextareas: () => void;
};
/** A Clipboard whose writes wait to be settled by the check, and counters for the select-and-copy fallback. */
const DEFERRED_CLIPBOARD = `(() => {
  const pending = [];
  let fallbacks = 0, textareas = 0;
  Object.defineProperty(Navigator.prototype, "clipboard", { get: () => ({
    writeText: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  }) });
  Document.prototype.execCommand = (command) => (command === "copy" ? (fallbacks++, true) : false);
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeName === "TEXTAREA") textareas++;
  }).observe(document, { childList: true, subtree: true });
  window.clip = {
    state: () => ({ pending: pending.length, fallbacks, textareas }),
    settle: (how, which) => {
      const [p] = pending.splice(which, 1);
      how === "reject" ? p.reject(new DOMException("Synthetic: write refused", "NotAllowedError")) : p.resolve();
    },
    resetTextareas: () => { textareas = 0; },
  };
})();`;

/**
 * Opens the share preview by keyboard (desktop) or touch, checks it says only the counts, copies
 * and downloads exactly the previewed text with no request, then closes, with focus back on the
 * button. Web Share is stubbed: the sheet is never really opened.
 */
async function sharePreview(page: Page, device: Device, name: string, counts: RegExp) {
  const opener = page.getByRole("button", { name: "Share a summary" });
  await page.evaluate(() => {
    (window as unknown as { shared: unknown[] }).shared = [];
    navigator.share = async (data) => {
      (window as unknown as { shared: unknown[] }).shared.push(data);
      throw new DOMException("Synthetic: sheet closed", "AbortError");
    };
  });
  if (device.touch) await opener.tap();
  else {
    await opener.focus();
    await page.keyboard.press("Enter");
  }
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor();
  const preview = await page.locator(".report-share-preview").innerText();
  assert.match(preview, /^My unaided coding practice on Muscle Memory\n/);
  assert.match(preview, counts);
  assert.match(preview, /Keep your coding skills in practice: https:\/\/\S+$/);
  assert.doesNotMatch(preview, /JS-|PY-|\d+ (s|min)\b|2026|sure|synthetic|participant|attempt|sha256|undefined|NaN|null/i);
  // Settled: a touch's tap highlight fades before the picture.
  await page.waitForTimeout(400);
  const box = await dialog.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= device.width + 1, "the preview fits the screen");
  // Every action is in view as the preview opens, without scrolling the dialog.
  for (const name of ["Copy text", "Share…", "Download"]) {
    const b = await page.getByRole("button", { name }).boundingBox();
    assert.ok(b && b.y >= 0 && b.y + b.height <= device.height, `${name} is in view (${b?.y}+${b?.height} of ${device.height})`);
  }
  await page.screenshot({ path: `${output}/${engine}-${device.name}-${name}-share.png` });
  const before = leaked;
  await page.getByRole("button", { name: "Copy text" }).click();
  await page.getByText(/^Copied\.$|^Couldn't copy here/).waitFor();
  if (await page.getByText(/^Copied\.$/).count())
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), preview, "copied exactly the preview");
  await page.getByRole("button", { name: "Share…" }).click();
  assert.deepEqual(await page.evaluate(() => (window as unknown as { shared: unknown[] }).shared), [{ text: preview }], "text only, no link with data");
  assert.equal(await page.getByText("Sharing isn't available here").count(), 0, "closing the sheet isn't an error");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
  const { readFile } = await import("node:fs/promises");
  assert.equal((await readFile((await download.path())!, "utf8")).trimEnd(), preview.trimEnd(), "downloaded exactly the preview");
  assert.equal(leaked, before, "nothing about the summary was requested");
  if (device.touch) await page.getByRole("button", { name: "Close" }).tap();
  else await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  if (!device.touch) assert.ok(await opener.evaluate((e) => e === document.activeElement), "focus back on the button");
  step(`${device.name}: share preview shows only counts; copy, share and download give exactly it, with no request`);
}
const FORBIDDEN = /sha256|revision|harness|receipt|percentile|cohort|evidence|reading time|thinking|undefined|NaN|null/i;

for (const device of DEVICES) {
  console.log(`${engine} ${device.name}`);
  const shot = (page: Page, name: string) => page.screenshot({ path: `${output}/${engine}-${device.name}-${name}.png`, fullPage: true });
  // The page scrolls inside its own container, so the viewport grows to the whole report for one shot.
  const whole = async (page: Page, name: string) => {
    const height = await page.evaluate(() => document.querySelector(".stats-content")!.scrollHeight + 160);
    await page.setViewportSize({ width: device.width, height: Math.max(device.height, height) });
    await page.screenshot({ path: `${output}/${engine}-${device.name}-${name}-full.png` });
    await page.setViewportSize({ width: device.width, height: device.height });
  };

  // Empty: one line and a start, no cards.
  {
    const { context, page } = await open(device, HISTORIES.empty);
    await report(page, "text=Your portrait starts with one challenge.");
    assert.equal(await page.locator(".report-question, .report-takeaways").count(), 0);
    assert.match(await page.locator(".report-discover").innerText(), /Still to discover[\s\S]*Your first solve answers these\./);
    await page.getByRole("link", { name: /Pick a language and start/ }).waitFor();
    await noOverflow(page, "empty");
    await shot(page, "1-empty");
    await whole(page, "1-empty");
    step(`${device.name}: empty report is one line and a start`);
    await context.close();
  }

  // One solve: describes that solve, no takeaways, a next challenge in its language.
  {
    const { context, page } = await open(device, HISTORIES.one);
    await report(page, "#q-iterate");
    const body = await text(page);
    assert.equal(await page.locator(".report-takeaways").count(), 0, "one solve has nothing to sum up");
    assert.match(body, /Your solve took 2 submissions; the first didn't pass\./);
    assert.match(body, /Your first edit came \d+ s in, then \d+ s of active editing to the solve\./);
    assert.match(body, /All JavaScript so far: 1 challenge solved\./);
    assert.doesNotMatch(body, /typically|Mostly/);
    assert.equal(await page.locator("#q-progress").count(), 0, "one solve can't answer pace");
    assert.doesNotMatch(body, FORBIDDEN);
    assert.match(await page.locator(".report-action").innerText(), /^Next: JS-/);
    // The same next challenge, quietly, at the top of the report.
    assert.equal(await page.locator(".report-hero .report-next a").getAttribute("href"), await page.locator(".report-action").getAttribute("href"));
    // Pace needs a second challenge like this one: the inventory names one, at the bottom.
    const pace = page.locator(".report-discover li", { hasText: "How did later solves compare with earlier ones?" });
    assert.match(await pace.innerText(), /Solve another easy JavaScript challenge/);
    assert.match((await pace.getByRole("link").getAttribute("href"))!, /^\/challenges\/JS-00\d$/);
    assert.ok(await page.evaluate(() => {
      const d = document.querySelector(".report-discover")!, qs = document.querySelectorAll(".report-question, .report-first");
      return !!(qs[qs.length - 1].compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), "the inventory comes after every answer");
    // Its shape: the solve's submissions in order, with the same in words for screen readers.
    assert.equal(await page.locator("#q-iterate .report-marks .is-no").count(), 1);
    assert.match(await page.locator("#q-iterate .report-dots .sr-only").innerText(), /^JS-00\d: didn't pass, passed; 2 submissions$/);
    await sharePreview(page, device, "2-one", /^1 JavaScript challenge solved$/m);
    await noOverflow(page, "one solve");
    await shot(page, "2-one");
    await whole(page, "2-one");
    await page.locator(".report-discover").screenshot({ path: `${output}/${engine}-${device.name}-2-one-discover.png` });
    step(`${device.name}: one solve describes that solve; next stays in JavaScript`);
    await context.close();
  }

  // Two solves: scoped observations ("Across your two…"), the next JavaScript challenge.
  {
    const { context, page } = await open(device, HISTORIES.two);
    await report(page, "#q-progress");
    const body = await text(page);
    assert.match(body, /Across your two easy JavaScript challenges, the first took \d+ s of active editing and the latest \d+ s\./);
    assert.match(body, /Across your two solves, none passed on the first submission; a typical one took 2 submissions\./);
    assert.doesNotMatch(body, /Mostly|faster|improv|You're getting/);
    assert.doesNotMatch(body, FORBIDDEN);
    assert.match(await page.locator(".report-action").innerText(), /^Next: JS-003 · /);
    assert.equal(await page.locator(".report-discover li", { hasText: "How did later solves compare with earlier ones?" }).count(), 0, "answered, so not listed");
    assert.ok(await page.locator(".report-takeaways li").count() <= 3);
    assert.equal(await page.locator("#q-iterate .report-dots li").count(), 2, "each solve's submissions in order");
    assert.equal(await page.locator("#q-progress .report-bar").count(), 2, "earlier and later as dotted bars");
    await sharePreview(page, device, "3-two", /^2 JavaScript challenges solved$/m);
    await noOverflow(page, "two solves");
    await shot(page, "3-two");
    await whole(page, "3-two");
    step(`${device.name}: two solves are scoped, never a trait; next is JS-003, not C-001`);
    await context.close();
  }

  // Rich: a few takeaways that lead to their answers; history slow and not blocking.
  {
    const { context, page, reads } = await open(device, HISTORIES.rich, { history: "slow", languages: ["javascript"] });
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
    assert.match(body, /Across your four easy JavaScript challenges, the earlier 2 /);
    assert.match(body, /How sure were you, and how did the first submission go\?/);
    assert.match(body, /the first submission passed in \d of \d solves? you felt sure about, and \d of \d you felt unsure about\./);
    assert.match(body, /Across your six solved challenges: JavaScript 5, Python 1\./);
    // Every dotted bar keeps a usable track, even at 320 px.
    const tracks = await page.locator(".report-bar").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    assert.ok(tracks.length && tracks.every((w) => w >= 60), `bar tracks ${tracks.join(", ")} px`);
    assert.match(body, /Back on JS-001, the latest took 2 submissions, the same as the first\./);
    assert.equal(await page.locator(".report-discover li", { hasText: "Did coming back to a challenge change anything?" }).count(), 0, "answered, so not listed");
    assert.doesNotMatch(body, /Mostly|faster|improv|You're getting/);
    assert.doesNotMatch(body, FORBIDDEN);
    assert.equal(await page.locator(".report-question .report-fyi:not(:has(a[href^='/settings/profile/languages']))").count(), 0, "no comparison in any answer (only the edit-languages link)");
    assert.match(body, /Not compared yet\. Other players: [\s\S]*AI models: /, "only the one line saying what each comparison waits on");
    // A ring for languages (each challenge in one slice), a split bar for usual and other, marks for confidence.
    assert.match((await page.locator("#q-languages .report-pie").getAttribute("aria-label"))!, /^Challenges worked on, by language: JavaScript 5 solved; Python 1 solved\.$/);
    assert.match((await page.locator("#q-familiarity .report-split").getAttribute("aria-label"))!, /Usual languages 5 challenges; Other languages 1 challenge/);
    assert.ok((await page.locator("#q-confidence .report-dots li").count()) >= 2);
    assert.equal(await page.locator("#q-start .report-pie, #q-start .report-split, #q-start .report-bars").count(), 0, "no picture of two different clocks");
    const ring = await page.locator(".report-ring").boundingBox();
    assert.ok(ring && ring.width >= 60, `ring is legible (${ring?.width} px)`);
    await sharePreview(page, device, "4-rich", /^6 challenges solved\n {2}JavaScript +■+ 5\n {2}Python +■+ 1\nFirst submission passed in \d of 7 solves$/m);
    await noOverflow(page, "rich");
    await shot(page, "4-rich");
    await whole(page, "4-rich");
    await page.locator(".report-discover").screenshot({ path: `${output}/${engine}-${device.name}-4-rich-discover.png` });
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

  // Sharing without Clipboard or Web Share: says what to do instead, and only one dialog however often it's pressed.
  {
    const { context, page } = await open(device, HISTORIES.two, {
      init: `Object.defineProperty(Navigator.prototype, "clipboard", { get: () => undefined }); delete Navigator.prototype.share; Document.prototype.execCommand = () => false;`,
    });
    await report(page, "#q-progress");
    const opener = page.getByRole("button", { name: "Share a summary" });
    await opener.click();
    await opener.click({ force: true }).catch(() => {});
    await page.evaluate(() => (document.querySelector(".report-share-open") as HTMLButtonElement).click());
    assert.equal(await page.locator("dialog[open]").count(), 1, "repeated presses open one preview");
    assert.equal(await page.getByRole("button", { name: "Share…" }).count(), 0, "no system share sheet, no button for it");
    await page.getByRole("button", { name: "Copy text" }).click();
    await page.getByText("Couldn't copy here. Select the text above and copy it yourself.").waitFor();
    // The text stays selectable by hand.
    assert.equal(await page.locator(".report-share-preview").evaluate((e) => getComputedStyle(e).userSelect), "text");
    await page.keyboard.press("Escape");
    await page.locator("dialog[open]").waitFor({ state: "detached" });
    // Reopened: no message left from before.
    await opener.click();
    assert.equal((await page.locator(".report-share [role=status]").innerText()).trim(), "");
    await shot(page, "7-share-unavailable");
    step(`${device.name}: without Clipboard or Web Share the preview says to copy by hand; repeated presses open one preview`);

    // Stealth while the preview is open (another tab): the report, the preview and its text go.
    const other = await context.newPage();
    await other.goto(`${origin}/privacy`);
    await other.evaluate(() => {
      const p = JSON.parse(localStorage.getItem("muscle-memory.profile")!);
      localStorage.setItem("muscle-memory.profile", JSON.stringify({ ...p, stealth: true }));
    });
    await page.getByText("You're in stealth, so there's no report here.").waitFor();
    assert.equal(await page.locator("dialog, .report-share-preview").count(), 0, "no preview or summary left in the page");
    assert.doesNotMatch(await page.content(), /challenges? solved|unaided coding practice/);
    await shot(page, "8-stealth-while-sharing");
    step(`${device.name}: stealth while the preview is open removes the preview and its text`);
    await context.close();
  }

  // A Clipboard write still pending when the copy stops being current: when the browser then
  // refuses it, the old text is never copied the other way, and no Copied or failure shows.
  {
    const { context, page } = await open(device, HISTORIES.two, { init: DEFERRED_CLIPBOARD });
    await report(page, "#q-progress");
    const share = page.getByRole("button", { name: "Share a summary" });
    const status = page.locator(".report-share [role=status]");
    const preview = page.locator(".report-share-preview");
    const clip = () => page.evaluate(() => (window as unknown as { clip: Clip }).clip.state());
    const settle = async (how: "reject" | "resolve", which = 0) => {
      await page.evaluate(([how, which]) => (window as unknown as { clip: Clip }).clip.settle(how as "reject" | "resolve", which as number), [how, which] as const);
      await page.waitForTimeout(300);
    };
    const pending = async (n = 1) => {
      await page.getByRole("button", { name: "Copy text" }).click();
      for (let i = 0; i < 50 && (await clip()).pending < n; i++) await page.waitForTimeout(50);
      assert.equal((await clip()).pending, n, "the Clipboard write is pending");
    };
    const noFallback = async (where: string, before: number) => {
      const c = await clip();
      assert.equal(c.fallbacks, before, `${where}: no select-and-copy after the copy ended`);
      assert.equal(c.textareas, 0, `${where}: no textarea of the old text was added`);
    };

    // Still current: the refusal falls back to select-and-copy, as before.
    await share.click();
    await pending();
    await settle("reject");
    assert.equal((await clip()).fallbacks, 1, "a current copy still falls back");
    await status.getByText("Copied.").waitFor();
    const base = 1;
    await page.evaluate(() => (window as unknown as { clip: Clip }).clip.resetTextareas());

    // Closed with the write pending.
    await pending();
    await page.keyboard.press("Escape");
    await settle("reject");
    await noFallback("closed", base);
    // Closed and reopened with the write pending.
    await share.click();
    await pending();
    await page.keyboard.press("Escape");
    await share.click();
    await settle("reject");
    await noFallback("reopened", base);
    assert.equal((await status.innerText()).trim(), "", "no message from the earlier copy");
    // Pressed twice: the first write's late refusal says nothing; the second's success does.
    await pending(1);
    await pending(2);
    await settle("reject", 0);
    await noFallback("superseded", base);
    assert.equal((await status.innerText()).trim(), "");
    await settle("resolve", 0);
    await status.getByText("Copied.").waitFor();
    // The summary changes under a pending write (a new solve read from this device).
    await pending();
    await page.evaluate(async (rows) => {
      const db: IDBDatabase = await new Promise((done) => {
        const r = indexedDB.open("muscle-memory-local-practice", 5);
        r.onsuccess = () => done(r.result);
      });
      await new Promise((done) => {
        const tx = db.transaction("records", "readwrite");
        for (const row of rows) tx.objectStore("records").put(row);
        tx.oncomplete = done;
      });
      db.close();
      window.dispatchEvent(new Event("focus"));
    }, attempt("PY-001", 2, 3, "sure") as unknown as object[]);
    await preview.getByText(/Python/).waitFor();
    await settle("reject");
    await noFallback("summary changed", base);
    assert.equal((await status.innerText()).trim(), "");
    // A private boundary (reset, import, deletion) with the write pending.
    await pending();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("muscle-memory:private-boundary", { detail: "start" })));
    await page.locator("dialog").waitFor({ state: "detached" });
    await settle("reject");
    await noFallback("private boundary", base);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("muscle-memory:private-boundary", { detail: "finish" })));
    await page.locator("#q-progress").waitFor();
    // Stealth from another tab with the write pending.
    await share.click();
    await pending();
    const other = await context.newPage();
    await other.goto(`${origin}/privacy`);
    await other.evaluate(() => {
      const p = JSON.parse(localStorage.getItem("muscle-memory.profile")!);
      localStorage.setItem("muscle-memory.profile", JSON.stringify({ ...p, stealth: true }));
    });
    await page.getByText("You're in stealth, so there's no report here.").waitFor();
    await settle("reject");
    await noFallback("stealth", base);
    assert.doesNotMatch(await page.content(), /challenges? solved|unaided coding practice|Copied\./);
    step(`${device.name}: a pending copy refused after close, reopen, a second press, a new summary, a private boundary or stealth copies nothing and says nothing`);
    await context.close();
  }

  // A reset/import/deletion boundary while the preview is open, then Back with it open.
  {
    const { context, page } = await open(device, HISTORIES.two);
    await report(page, "#q-progress");
    await page.getByRole("button", { name: "Share a summary" }).click();
    await page.locator("dialog[open]").waitFor();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("muscle-memory:private-boundary", { detail: "start" })));
    await page.locator("dialog").waitFor({ state: "detached" });
    assert.doesNotMatch(await page.content(), /challenges? solved|unaided coding practice/, "stale summary gone at the boundary");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("muscle-memory:private-boundary", { detail: "finish" })));
    await page.locator("#q-progress").waitFor();
    assert.equal(await page.locator("dialog[open]").count(), 0, "the preview doesn't come back on its own");
    step(`${device.name}: a private boundary while the preview is open removes it; it stays closed after`);

    await page.getByRole("button", { name: "Share a summary" }).click();
    await page.locator("dialog[open]").waitFor();
    await page.goBack();
    await page.waitForURL((u) => !u.pathname.startsWith("/stats"));
    await page.goForward();
    await page.locator("#q-progress").waitFor();
    assert.equal(await page.locator("dialog[open]").count(), 0, "Back then Forward reopens the report, not the preview");
    step(`${device.name}: Back with the preview open leaves the page; Forward shows the report without it`);
    await context.close();
  }

  // Stealth: no report, no history read.
  {
    const { context, page, reads } = await open(device, HISTORIES.rich, { stealth: true });
    await page.goto(`${origin}/stats`);
    await page.getByText("You're in stealth, so there's no report here.").waitFor();
    await page.waitForTimeout(500);
    assert.equal(reads(), 0, "stealth reads no history");
    assert.equal(await page.locator(".report-question, .report-discover").count(), 0, "no report, no inventory");
    step(`${device.name}: stealth shows no report or inventory and reads nothing`);
    await context.close();
  }
}

await browser.close();
assert.equal(receiptReads, 0, "no model results requested");
assert.equal(leaked, 0, "no request carried the share summary");
assert.deepEqual([...new Set(errors)], [], "no console or page errors");
await writeFile(`${output}/${engine}-results.json`, JSON.stringify({ engine, blocked, timings, steps: log }, null, 2));
console.log(`${engine}: ${log.length} checks passed; ${blocked} off-origin requests stopped, none sent`);
console.log(timings);
