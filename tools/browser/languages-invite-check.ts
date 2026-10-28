/** ENG-360 synthetic acceptance: the report's optional languages invitation and its form.
 * INVITE_ORIGIN=http://localhost:3074 INVITE_BROWSER=chromium|webkit node --import tsx tools/browser/languages-invite-check.ts
 * Every context is fresh and synthetic: a seeded profile and one fixture attempt in IndexedDB, with an
 * empty upload queue. Requests off the origin and history reads are stopped in the browser and
 * counted, never sent. Device emulation, not real devices. Needs content/catalog.json for the live revision.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit, type BrowserContext, type Page } from "playwright";
import { LEGAL_VERSION } from "../../apps/web/lib/legal";
import { trace } from "../../packages/developer-profile/fixtures";
import catalog from "../../content/catalog.json" with { type: "json" };

const origin = process.env.INVITE_ORIGIN ?? "http://localhost:3074";
const engine = process.env.INVITE_BROWSER ?? "chromium";
assert.ok(engine === "chromium" || engine === "webkit");
const output = process.env.INVITE_ARTIFACTS ?? `${process.env.HOME}/Code/.worktrees/eng360-qa`;
await mkdir(output, { recursive: true });
const KEY = "JS-001";
const live = (catalog as { challenges: { key: string; revision: string }[] }).challenges.find((c) => c.key === KEY)!;
const records = trace("qa-attempt", "qa-source", KEY, live.revision);
const PARTICIPANT = "synthetic-participant";
const ANSWERED = "2026-10-27T00:00:00.000Z";

type Device = { name: string; width: number; height: number; touch: boolean };
const DEVICES: Device[] = [
  { name: "desktop-1280", width: 1280, height: 800, touch: false },
  { name: "phone-390", width: 390, height: 844, touch: true },
  { name: "phone-320", width: 320, height: 640, touch: true },
  { name: "phone-landscape", width: 844, height: 390, touch: true },
];
type Seed = { profile: Record<string, unknown>; asked: Record<string, unknown>; stealth?: boolean; dismissed?: string[] };
const GUESS: Seed = { profile: { languages: ["python"], editor: "vim" }, asked: { editor: { answeredAt: ANSWERED } } };

const browser = await (engine === "webkit" ? webkit : chromium).launch();
let blocked = 0;
const log: string[] = [];
const step = (s: string) => {
  log.push(s);
  console.log(`  ✓ ${s}`);
};

async function open(device: Device, seed: Seed, init?: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    hasTouch: device.touch,
    isMobile: device.touch && engine === "chromium",
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.startsWith("/api/private-history") || url.pathname.includes("/ingest/")) {
      blocked++;
      return route.fulfill({ status: 503, body: "isolated-synthetic-qa" });
    }
    return route.continue();
  });
  await context.addCookies([{ name: "mm_consent", value: LEGAL_VERSION, url: origin }]);
  await context.addInitScript(
    ([stored, dismissed, rows, participant]) => {
      // Seed once per context; later navigations keep whatever the page saved.
      if (localStorage.getItem("muscle-memory.qa-seeded")) return;
      localStorage.setItem("muscle-memory.qa-seeded", "1");
      localStorage.setItem("muscle-memory.profile", stored as string);
      if (dismissed) localStorage.setItem("muscle-memory.dismissed", dismissed as string);
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
        for (const r of rows as object[]) tx.objectStore("records").put(r);
        tx.oncomplete = () => request.result.close();
      };
    },
    [
      JSON.stringify({
        version: "2",
        createdAt: ANSWERED,
        accepted: { version: LEGAL_VERSION, at: ANSWERED },
        stealth: seed.stealth,
        asked: seed.asked,
        profile: seed.profile,
      }),
      seed.dismissed ? JSON.stringify(seed.dismissed) : null,
      records,
      PARTICIPANT,
    ] as const,
  );
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  return { context, page };
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("muscle-memory.profile")!));
const invite = (page: Page) => page.locator("#q-languages .report-invite");
async function report(page: Page, hash = "") {
  // IndexedDB seeding is async; the first view may read before it lands.
  for (let i = 0; i < 3; i++) {
    await page.goto(`${origin}/stats${hash}`);
    if (await page.locator("#q-languages").waitFor({ timeout: 8000 }).then(() => true, () => false)) return;
  }
  throw new Error("the languages answer never rendered");
}
async function noOverflow(page: Page, where: string) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}: no sideways scroll`);
}
const tap = (device: Device, page: Page, selector: string) =>
  device.touch ? page.locator(selector).tap() : page.locator(selector).click();

for (const device of DEVICES) {
  console.log(`${engine} ${device.name}`);
  const shot = (page: Page, name: string) => page.screenshot({ path: `${output}/${engine}-${device.name}-${name}.png`, fullPage: true });

  // 1. A quick-start guess: quiet, named as a guess, nothing focused, Next still there.
  {
    const { context, page } = await open(device, GUESS);
    await report(page);
    await invite(page).waitFor();
    const text = await invite(page).innerText();
    assert.match(text, /Optional: Python is ticked from quick start, as a guess\./);
    assert.doesNotMatch(text, /unlock|cohort|compare|similar|faster/i);
    assert.equal(await page.evaluate(() => document.activeElement === document.body), true, "no focus taken");
    assert.equal(await page.locator(".report-preview").count(), 0, "no trailing card");
    await noOverflow(page, "report with invitation");
    await invite(page).scrollIntoViewIfNeeded();
    await shot(page, "1-invite-guess");
    step(`${device.name}: guess named inline under the languages answer, no focus taken`);

    // 2. Open the form, save nothing: nothing is answered.
    if (device.touch) await page.getByRole("link", { name: /Confirm your languages/ }).tap();
    else {
      // Keyboard: Tab to the link, Enter.
      await page.getByRole("link", { name: /Confirm your languages/ }).focus();
      await page.keyboard.press("Enter");
    }
    await page.waitForURL(/\/settings\/profile\/languages\?from=stats$/);
    await page.getByText("Ticked from quick start, as a guess.").waitFor();
    const intro = await page.locator(".t-dim").first().innerText();
    assert.match(intro, /groups your own practice on your report into your usual languages and others/);
    assert.doesNotMatch(intro, /compare|cohort|unlock/i, "the language route promises only the grouping");
    await noOverflow(page, "form");
    await shot(page, "2-form-guess");
    await page.locator("#profile-0").click();
    await page.getByText("Nothing changed. A guess stays a guess").waitFor();
    assert.equal((await stored(page)).asked.languages, undefined, "viewing and saving nothing never confirms");

    // 3. Cancel from the form with Esc while on a language checkbox, then while on Confirm: back to the report, unchanged.
    await page.locator("label.t-option", { hasText: "JavaScript" }).click();
    await page.getByRole("checkbox", { name: /JavaScript/ }).focus();
    await page.keyboard.press("Escape");
    await page.waitForURL(/\/stats#q-languages$/);
    await invite(page).waitFor();
    assert.deepEqual((await stored(page)).profile.languages, ["python"], "Esc on a checkbox saves nothing");
    await page.getByRole("link", { name: /Confirm your languages/ }).click();
    await page.waitForURL(/from=stats/);
    await page.getByRole("button", { name: "Confirm as my answer" }).focus();
    await page.keyboard.press("Escape");
    await page.waitForURL(/\/stats#q-languages$/);
    await invite(page).waitFor();
    assert.equal((await stored(page)).asked.languages, undefined, "Esc on Confirm saves nothing");
    step(`${device.name}: no-op save, and Esc from a checkbox or from Confirm, keep the guess a guess`);

    // 4. Confirm deliberately; unrelated answers keep their provenance; return lands on the answer.
    await page.getByRole("link", { name: /Confirm your languages/ }).click();
    await page.waitForURL(/from=stats/);
    if (device.touch) {
      await tap(device, page, "text=Confirm as my answer");
      await page.getByText("Confirmed. Save to keep it as your answer.").waitFor();
      await page.locator("#profile-0").tap();
    } else {
      // Keyboard only, with the toolbar cursor first moved away from Save (to back): Confirm, then Enter must save.
      await page.locator("#profile-0").focus();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "profile-2", "cursor on back to your report");
      await page.getByRole("button", { name: "Confirm as my answer" }).focus();
      await page.keyboard.press("Enter");
      await page.getByText("Confirmed. Save to keep it as your answer.").waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.id), "profile-0", "focus lands on Save, wherever the cursor was");
      await page.keyboard.press("Enter");
      await page.getByText("Saved.").waitFor();
      assert.match(page.url(), /\/settings\/profile\/languages\?from=stats$/, "Enter saved instead of leaving");
    }
    await page.getByRole("link", { name: "back to your report" }).first().waitFor();
    const confirmed = await stored(page);
    assert.deepEqual(confirmed.profile, { languages: ["python"], editor: "vim" });
    assert.ok(confirmed.asked.languages.answeredAt);
    assert.equal(confirmed.asked.editor.answeredAt, ANSWERED);
    await shot(page, "3-form-saved");
    await page.getByRole("status").getByRole("link", { name: "back to your report" }).click();
    await page.waitForURL(/\/stats#q-languages$/);
    await page.locator("#q-familiarity").waitFor();
    assert.equal(await invite(page).count(), 0, "answered: no invitation");
    if (device.height < 700 || device.width < 800)
      { await page.waitForTimeout(500); const top = await page.evaluate(() => [document.getElementById("q-languages")!.getBoundingClientRect().top, scrollY, document.documentElement.scrollHeight, innerHeight]); assert.ok(Math.abs(top[0]) < 80, `returned to the answer: ${top}`); }
    await shot(page, "4-report-answered");
    step(`${device.name}: deliberate confirm answers only languages and returns to the answer`);

    // 5. Back and Forward.
    await page.goBack();
    await page.waitForURL(/\/settings\/profile\/languages/);
    await page.goForward();
    await page.waitForURL(/\/stats#q-languages$/);
    await page.locator("#q-familiarity").waitFor();
    step(`${device.name}: Back and Forward keep both pages whole`);

    // 6. Later edit and clear back to unknown.
    await page.getByRole("link", { name: "Edit your usual languages" }).click();
    await page.waitForURL(/from=stats/);
    await tap(device, page, "text=Clear answer");
    await page.locator("#profile-0").click();
    await page.getByText("Saved.").waitFor();
    const cleared = await stored(page);
    assert.equal(cleared.profile.languages, undefined);
    assert.equal(cleared.asked.languages, undefined);
    assert.equal(cleared.asked.editor.answeredAt, ANSWERED);
    await page.getByRole("status").getByRole("link", { name: "back to your report" }).click();
    await invite(page).waitFor();
    assert.match(await invite(page).innerText(), /Say which languages you work with/);
    step(`${device.name}: later edit and clear return to unknown, invitation reappears plainly`);

    // 7. Hide: visible confirmation, remembered across reloads, no request made.
    const before = blocked;
    await tap(device, page, "#q-languages >> text=Hide this");
    const line = page.locator("#q-languages [role=status]");
    await line.waitFor();
    assert.match(await line.innerText(), /^Hidden\. Your languages stay in settings → profile\.$/);
    assert.equal(await line.evaluate((el) => el === document.activeElement), true, "focus stays on what replaced the button");
    await shot(page, "5-hidden");
    await page.reload();
    await page.locator("#q-languages").waitFor();
    await page.waitForTimeout(300);
    assert.equal(await invite(page).count(), 0, "hidden for good");
    assert.equal(blocked, before, "hiding sends nothing");
    step(`${device.name}: Hide this is visible, focused, remembered, and silent`);

    // 8. Reset keeps the choice, like the profile.
    await page.goto(`${origin}/settings/reset`);
    await page.locator("#reset-0").click();
    await page.keyboard.press("y");
    await page.getByText("Done. Progress cleared.").waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("muscle-memory.dismissed")), '["languages"]');
    step(`${device.name}: reset keeps the hidden choice`);
    await page.goto(`${origin}/settings/profile`);
    await page.getByText("Every question is optional. Your answers let us compare groups (never people)").waitFor();
    step(`${device.name}: the all-questions form keeps its own introduction`);
    await context.close();
  }

  // 9. Stealth: no report, no invitation.
  {
    const { context, page } = await open(device, { ...GUESS, stealth: true });
    await page.goto(`${origin}/stats`);
    await page.getByText("no report here").waitFor();
    assert.equal(await page.locator(".report-invite").count(), 0);
    step(`${device.name}: stealth shows no report and no invitation`);
    await context.close();
  }

  // 10. Storage refuses the hide and the save; unavailable storage shows no report.
  {
    const refuse = `{
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === "muscle-memory.dismissed" || (k === "muscle-memory.profile" && localStorage.getItem("muscle-memory.qa-seeded"))) throw new DOMException("full", "QuotaExceededError");
        return set.call(this, k, v);
      };
    }`;
    const { context, page } = await open(device, GUESS, refuse);
    await report(page);
    await invite(page).waitFor();
    await tap(device, page, "#q-languages >> text=Hide this");
    await page.getByText("Hidden for now, but this browser couldn't remember that").waitFor();
    await page.reload();
    await invite(page).waitFor();
    await page.goto(`${origin}/settings/profile/languages?from=stats`);
    await page.getByText("Confirm as my answer").click();
    await page.locator("#profile-0").click();
    await page.getByText("This browser couldn't save your answers.").waitFor();
    assert.equal((await stored(page)).asked.languages, undefined);
    step(`${device.name}: refused storage says so for hide and save, and changes nothing`);
    await context.close();
    const blockedStorage = await open(device, GUESS, `Object.defineProperty(window, "localStorage", { get() { throw new DOMException("denied", "SecurityError"); } });`);
    await blockedStorage.page.goto(`${origin}/stats`);
    await blockedStorage.page.getByText(/couldn.t be read on this browser|Reading your practice/).first().waitFor();
    assert.equal(await blockedStorage.page.locator(".report-invite").count(), 0);
    step(`${device.name}: unavailable storage shows no invitation`);
    await blockedStorage.context.close();
  }
}
await browser.close();
await writeFile(`${output}/${engine}-results.json`, JSON.stringify({ engine, blocked, steps: log }, null, 2));
console.log(`${engine}: ${log.length} checks passed; ${blocked} off-origin or history requests stopped, none sent`);
