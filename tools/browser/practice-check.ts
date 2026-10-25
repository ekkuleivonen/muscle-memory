/**
 * Practice in a real browser, sandbox and runtime, with a synthetic participant: a start from
 * the picker, failing and passing submissions, completion, the next challenge, practising
 * again, stars and copying from the challenge, and what each records.
 * LOOP_ORIGIN=http://localhost:3000 node --import tsx tools/browser/practice-check.ts
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { LEGAL_VERSION } from "../../apps/web/lib/legal";
import { readChallenge } from "../../packages/content/source";
import { PRACTICE_CAPTURE_VERSION } from "../../packages/domain/practice";

const origin = process.env.LOOP_ORIGIN ?? "http://localhost:3000";
const screenshots = process.env.PRACTICE_SCREENSHOTS;
if (screenshots) await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.route("**/ingest/**", (route) =>
  route.fulfill({ status: 410, body: "synthetic-integration-qa" }),
);
await context.addCookies([{ name: "mm_consent", value: LEGAL_VERSION, url: origin }]);
await context.addInitScript((version) => {
  // Also runs in the sandbox's opaque-origin frame, which has no storage.
  if (origin === "null") return;
  if (!localStorage.getItem("muscle-memory.profile"))
    localStorage.setItem(
      "muscle-memory.profile",
      JSON.stringify({
        version: "2",
        createdAt: new Date().toISOString(),
        accepted: { version, at: new Date().toISOString() },
        stealth: true,
        profile: {},
      }),
    );
}, LEGAL_VERSION);
const page = await context.newPage();
page.setDefaultTimeout(90_000);
page.on("pageerror", (error) => console.warn("page error:", error.message));
const editor = () => page.locator(".practice-editor:not([hidden]) .cm-content");
const ready = async () => {
  await editor().waitFor();
  await page.waitForFunction(
    () => !document.querySelector<HTMLButtonElement>(".practice-controls button:last-child")?.disabled,
  );
};
const submit = async () => {
  await editor().focus();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
};
const records = async () =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("muscle-memory-local-practice");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<any[]>((resolve, reject) => {
        const r = db.transaction("records").objectStore("records").getAll();
        // Stored by id; in the order they happened.
        r.onsuccess = () =>
          resolve(
            r.result
              .map((r: any) => JSON.parse(r.payload))
              .sort((a: any, b: any) =>
                String(a.occurredAt).localeCompare(String(b.occurredAt)),
              ),
          );
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  });
const ofType = async (type: string) => (await records()).filter((v) => v.type === type);
/** Records of a type once there are at least `count`: writes are batched. */
const until = async (type: string, count = 1) => {
  for (let i = 0; i < 100; i++) {
    const found = await ofType(type);
    if (found.length >= count) return found;
    await page.waitForTimeout(100);
  }
  throw new Error(`Expected ${count} ${type} records`);
};
const shot = async (name: string) => {
  if (screenshots) await page.screenshot({ path: `${screenshots}/${name}.png` });
};
const solution = readChallenge(
  new URL("../../content/challenges/JS-002", import.meta.url).pathname,
).private.solution;

try {
  // A start from the picker: its search and the position of the pick.
  await page.goto(`${origin}/challenges?q=${encodeURIComponent("lang:javascript composer")}`);
  const search = page.locator(".picker input");
  await search.waitFor();
  // Enter does nothing until the picker has hydrated, which the page doesn't announce.
  for (let tries = 0; ; tries++) {
    await search.press("Enter");
    const moved = await page
      .waitForFunction(() => location.pathname === "/challenges/JS-002", null, { timeout: 3000 })
      .then(() => true, () => false);
    if (moved) break;
    assert.ok(tries < 20, "Enter in the picker starts practice");
  }
  await ready();
  const [started] = await until("practice.started");
  assert.equal(started.data.from, "picker");
  assert.equal(started.challenge, "JS-002");
  assert.equal(started.data.position, 1);
  assert.match(started.data.query, /composer/);
  assert.equal(started.captureVersion, PRACTICE_CAPTURE_VERSION);
  const [opened] = await until("practice.opened");
  assert.equal(opened.attemptId, started.attemptId);
  assert.ok(opened.data.environment?.browser);

  // Copying from the challenge records what was copied.
  await page.locator(".practice-challenge h1").selectText();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+c" : "Control+c");
  // A failing submission: hidden cases say a category, never a value.
  await editor().fill('export function countWords(text) { return text.split(" ").length; }');
  await submit();
  await page.locator(".ci-failing").waitFor();
  const hidden = page.locator(".ci-failing li").filter({ hasText: "hidden case" });
  assert.equal(await hidden.locator("code, pre, dl").count(), 0);
  const [failed] = await until("practice.submitted");
  assert.equal(failed.data.result, "failed");
  assert.equal((await ofType("practice.completed")).length, 0);
  await shot("practice-failure");

  // Examples never complete; a passing submission does.
  await editor().fill(solution);
  await page.getByRole("button", { name: "Run examples", exact: true }).click();
  await page.locator(".ide-summary.pass").waitFor();
  assert.equal((await ofType("practice.completed")).length, 0, "examples cannot complete");
  await submit();
  await page.getByRole("heading", { name: "Next challenge", exact: true }).waitFor();
  const [completed] = await until("practice.completed");
  assert.equal(completed.attemptId, started.attemptId);
  const passed = (await ofType("practice.submitted")).at(-1);
  assert.equal(passed.data.result, "passed");
  assert.equal(completed.data.runId, passed.data.runId);
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("muscle-memory.progress")!));
  assert.equal(progress["word-count-javascript"].completions, 1);
  assert.equal(
    (await ofType("practice.clipboard")).filter((v) => v.data.source === "challenge").length,
    1,
  );
  // The questions after completing are optional, one click each.
  await page.getByRole("button", { name: "about right", exact: true }).click();
  const [answered] = await until("practice.answered");
  assert.deepEqual(answered.data, { question: "difficulty", answer: "right" });
  assert.equal(answered.attemptId, started.attemptId);
  await shot("practice-after-completion");

  // A reload resumes the completed attempt; no new start.
  await page.reload();
  await ready();
  assert.equal((await ofType("practice.started")).length, 1);
  await page.getByRole("heading", { name: "Next challenge", exact: true }).waitFor();

  // Stars from practice are recorded.
  await page.locator(".pane-star").click();
  await page.waitForFunction(() => localStorage.getItem("muscle-memory.stars")?.includes("JS-002"));

  // Practising again begins a new attempt from the starting code.
  await page.getByRole("button", { name: "Practise this again", exact: true }).click();
  await page.waitForURL(`${origin}/challenges/JS-002`);
  await ready();
  const starts = await until("practice.started", 2);
  assert.equal(starts.length, 2);
  assert.equal(starts[1].data.from, "again");
  assert.notEqual(starts[1].attemptId, started.attemptId);
  assert.doesNotMatch(await editor().innerText(), /trim|\\s\+/);
  assert.equal((await until("site.starred")).length, 1);

  // The next challenge after completing again is recorded as such.
  await editor().fill(solution);
  await submit();
  await page.getByRole("heading", { name: "Next challenge", exact: true }).waitFor();
  const nextLink = page.locator(".practice-next a.btn.primary");
  const nextHref = (await nextLink.getAttribute("href"))!;
  await nextLink.click();
  await page.waitForURL(`${origin}${nextHref}`);
  await ready();
  const after = (await until("practice.started", 3)).at(-1);
  assert.equal(after.data.from, "next");
  assert.equal(after.challenge, nextHref.split("/").at(-1));
  assert.equal(
    (await ofType("practice.completed")).at(-1).data.suggested,
    after.challenge,
  );
  console.log(
    "PASS: picker start, challenge copy, failing and passing submissions, completion, questions after it, resume, star, practise again, next challenge",
  );
} catch (error) {
  console.error("at", page.url());
  if (screenshots) await page.screenshot({ path: `${screenshots}/failure.png` });
  throw error;
} finally {
  await context.close();
  await browser.close();
}
