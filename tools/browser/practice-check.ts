/** Real sandbox/runtime + storage regression for ENG-328. Synthetic participant only.
 * LOOP_ORIGIN=http://localhost:3128 node --import tsx tools/browser/practice-check.ts
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { SEED_ISSUES } from "../../content/seed";
const origin = process.env.LOOP_ORIGIN ?? "http://localhost:3000";
const screenshots = process.env.PRACTICE_SCREENSHOTS;
if (screenshots) await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(25_000);
const editor = () => page.locator(".practice-editor:not([hidden]) .cm-content");
const activate = async (selector: ReturnType<typeof page.locator>) => {
  await selector.focus();
  await page.keyboard.press("Enter");
};
const ready = async () => {
  await editor().waitFor();
  await page.waitForFunction(
    () =>
      !document.querySelector<HTMLButtonElement>(
        ".practice-controls button:last-child",
      )?.disabled,
  );
};
const submit = async () => {
  await editor().focus();
  await page.keyboard.press("Control+Enter");
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
        const r = db.transaction("workspace").objectStore("workspace").getAll();
        r.onsuccess = () =>
          resolve(r.result.map((r: any) => JSON.parse(r.payload)));
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  });
const finished = async () =>
  (await records()).filter(
    (v) =>
      v.type === "observation.board.moved" &&
      v.data.trigger === "checks-passed",
  );
const shot = async (name: string) => {
  if (screenshots) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${screenshots}/${name}.png` });
  }
};
try {
  // Failed asset load leaves editing possible, with one recovery action.
  await page.route("**/runtime/javascript-*/**", (r) => r.abort("failed"));
  await page.goto(`${origin}/play`);
  await activate(
    page.getByRole("button", { name: "Start in JavaScript", exact: true }),
  );
  await editor().waitFor();
  await page
    .getByRole("button", { name: "Retry checks", exact: true })
    .waitFor();
  await editor().fill(
    'export function countWords(text) { return text.split(" ").length; }',
  );
  await page.unroute("**/runtime/javascript-*/**");
  await activate(
    page.getByRole("button", { name: "Retry checks", exact: true }),
  );
  await ready();
  await shot("practice-before-submit");
  assert.equal(
    await page.locator(".ide-activity, .ide-explorer, .status-trigger").count(),
    0,
  );
  await submit();
  await page.getByText("14 of 19 cases failed.", { exact: true }).waitFor();
  const hidden = page
    .locator(".ci-failing li")
    .filter({ hasText: "hidden case" });
  assert.ok((await hidden.count()) > 0);
  assert.equal(await hidden.locator("code, pre, dl").count(), 0);
  assert.equal((await finished()).length, 0);
  await shot("practice-failure");
  await activate(page.getByText("Output", { exact: true }));
  assert.match(
    await page.locator(".ide-output").innerText(),
    /Detailed output is hidden/,
  );
  assert.doesNotMatch(
    await page.locator(".ide-output").innerText(),
    /pull request/i,
  );
  await page.getByText("Output", { exact: true }).click();
  // Cancellation never completes; the keyboard can leave and re-enter the editor.
  await editor().fill("export function countWords(text) { while (true) {} }");
  await submit();
  await activate(
    page.getByRole("button", { name: "Cancel check", exact: true }),
  );
  await page.getByText("The check was cancelled.", { exact: true }).waitFor();
  assert.equal((await finished()).length, 0);
  const good =
    "export function countWords(text) { return text.trim() ? text.trim().split(/\\s+/).length : 0; }";
  await editor().fill(good);
  await editor().focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  assert.equal(
    await editor().evaluate((el) => el === document.activeElement),
    false,
  );
  await activate(
    page.getByRole("button", { name: "Run examples", exact: true }),
  );
  await page.locator(".ide-summary").filter({ hasText: "5 passed" }).waitFor();
  assert.equal((await finished()).length, 0, "public examples cannot complete");
  await submit();
  await page
    .getByRole("heading", { name: "Next challenge", exact: true })
    .waitFor();
  assert.equal(
    await editor().evaluate((el) => el === document.activeElement),
    true,
    "feedback retains editing focus",
  );
  await page.getByText("Done.", { exact: true }).waitFor();
  const done = await finished();
  assert.equal(done.length, 1);
  assert.equal(done[0].captureVersion, "board-capture-7.2.0");
  assert.equal(done[0].data.via, "keyboard");
  const all = await records();
  assert.equal(
    all.filter((v) => v.type === "observation.board.result").length,
    1,
  );
  assert.equal(
    all.filter(
      (v) =>
        v.type === "observation.board.resolved" ||
        v.data?.trigger === "pull-request-merged",
    ).length,
    0,
  );
  assert.ok(
    all.some(
      (v) =>
        v.type === "observation.workspace.run" &&
        v.captureVersion === "workspace-capture-6.0.0" &&
        v.data.runId === done[0].data.runId,
    ),
  );
  assert.equal(await page.locator(".practice-controls .primary").count(), 0);
  assert.equal(await page.locator(".practice-next .btn.start").count(), 1);
  await shot("practice-after-completion");
  // Editing immediately withdraws current verification; past completion remains immutable.
  await editor().press("End");
  await editor().press("Space");
  await page
    .getByText("You've edited the code since the last check.", { exact: true })
    .waitFor();
  assert.equal(await page.locator(".practice-next").count(), 0);
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.reload();
  await ready();
  assert.match(await editor().innerText(), /countWords/);
  assert.equal((await finished()).length, 1);
  await page.goto(`${origin}/profile`);
  await page.getByText(/Verified completion/).waitFor();
  // Old submission URLs are read-only, with no merge/Resolve/reply writer.
  await page.goto(`${origin}/pulls/QUICK-2/${done[0].data.pullRequest}`);
  await page.getByText(/saved submission record/).waitFor();
  assert.equal(
    await page.getByRole("button", { name: /Merge|Resolve|Reply/ }).count(),
    0,
  );
  // An authored correctness/safety blocker persists despite all cases passing.
  await page.goto(`${origin}/work/FN-1`);
  await ready();
  const fn = SEED_ISSUES.find((i) => i.id === "frequency-map")!;
  const solution = Object.values(fn.private.reference)[0];
  assert.equal(typeof solution, "string");
  await editor().fill('print("debug")\n' + solution);
  await submit();
  await page
    .getByText(/All .* cases pass, but a required rule still applies/)
    .waitFor();
  assert.equal((await finished()).length, 1);
  await editor().fill(solution);
  await submit();
  await page
    .getByRole("heading", { name: "Next challenge", exact: true })
    .waitFor();
  assert.equal((await finished()).length, 2);
  // Existing multi-file content stays editable without a file explorer.
  await page.goto(
    `${origin}/work/SHOP-8?revision=sha256:675596eb25cb85f7ed035b3f24ad21a489ffc4b37bb5214aa3ef196ba9b0c068`,
  );
  await ready();
  const source = page.getByRole("combobox", {
    name: "Editable source",
    exact: true,
  });
  const paths = await source
    .locator("option")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("value")!));
  assert.ok(paths.length > 1);
  await source.selectOption(paths[1]);
  await editor().fill((await editor().innerText()) + "\n// source continuity");
  await page.getByText("Saved", { exact: true }).waitFor();
  await source.selectOption(paths[0]);
  await source.selectOption(paths[1]);
  assert.match(await editor().innerText(), /source continuity/);
  await page.reload();
  await ready();
  assert.equal(await source.inputValue(), paths[1]);
  assert.match(await editor().innerText(), /source continuity/);
  await page.goto(`${origin}/work/DATA-3`);
  await editor().waitFor();
  await page.getByText("Data schema", { exact: true }).waitFor();
  assert.match(
    await page
      .locator(".practice-challenge details")
      .filter({ has: page.getByText("Data schema", { exact: true }) })
      .innerText(),
    /CREATE TABLE/i,
  );
  // Mobile keeps the public requirements, examples and code accessible without an overlay.
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await shot("practice-mobile");
  console.log(
    "PASS: actual full-suite Submit, failed hidden checks, cancel/retry, public-only green, automatic completion, stale/edit/reload, atomic records, required-rule recovery, profile, historical read-only URL, keyboard focus and mobile",
  );
} finally {
  await context.close();
  await browser.close();
}
