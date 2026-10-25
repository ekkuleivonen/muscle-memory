/** ENG-328 route/keyboard regressions against a running app. Isolated synthetic records only.
 * LOOP_ORIGIN=http://localhost:3128 node --import tsx tools/browser/loop-check.ts
 */
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { SEED_ISSUES } from "../../content/seed";

const origin = process.env.LOOP_ORIGIN ?? "http://localhost:3000";
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
page.setDefaultTimeout(20_000);
const editor = () =>
  page.locator('.ide-editor:not([hidden]) .cm-content[contenteditable="true"]');
const primary = () =>
  page.locator(
    ".ide-actions .ide-run:not(.secondary), .ide-actions .btn.start",
  );
const hasPrimary = async (text: string) => {
  await primary().filter({ hasText: text }).waitFor();
  assert.equal(await primary().count(), 1);
};
const keyActivate = async (target: ReturnType<Page["locator"]>) => {
  await target.focus();
  await page.keyboard.press("Enter");
};
const work = async (key: string) => {
  await page.goto(`${origin}/work/${key}`);
  await editor().waitFor();
  await page
    .getByRole("button", { name: /Run tests/ })
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      !document.querySelector<HTMLButtonElement>(
        '.ide-actions button[title^="Run the tests"]',
      )?.disabled,
  );
};
const fill = async (text: string) => {
  await editor().fill(text);
  await editor().focus();
};
const push = async () => {
  await editor().focus();
  await page.keyboard.press("Control+Shift+Enter");
};
const run = async () => {
  await editor().focus();
  await page.keyboard.press("Control+Enter");
};
try {
  // A failed asset download leaves editing available and makes Retry the dominant action.
  await page.route("**/runtime/javascript-*/**", (route) =>
    route.abort("failed"),
  );
  await page.goto(`${origin}/play`);
  await keyActivate(
    page.getByRole("button", { name: "Start in JavaScript", exact: true }),
  );
  await editor().waitFor();
  await hasPrimary("Retry environment");
  await page.unroute("**/runtime/javascript-*/**");
  await keyActivate(
    page.getByRole("button", { name: "Retry environment", exact: true }),
  );
  await page.waitForFunction(
    () =>
      !document.querySelector<HTMLButtonElement>(
        '.ide-actions button[title^="Run the tests"]',
      )?.disabled,
  );
  await editor().focus();
  await hasPrimary("Run tests");
  assert.match(
    await page.locator(".ide-panel").innerText(),
    /Start in src\/count-words.js/,
  );
  assert.equal(
    await editor().evaluate((el) => el === document.activeElement),
    true,
  );

  // Keyboard test failure, cancellation and recovery never create a merge affordance.
  await run();
  await page.getByText(/failed ·/).waitFor();
  await hasPrimary("Run tests");
  await push();
  await page.getByText(/Open · checks failed/).waitFor();
  await page.goto(`${origin}/pulls/QUICK-2/1`);
  await page.locator(".pull-next-action").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Merge pull request", exact: true })
      .count(),
    0,
  );
  assert.equal(await page.locator(".outcome-actions").count(), 0);
  assert.match(await page.locator(".pull-findings").innerText(), /CI only/);
  await keyActivate(page.locator(".pull-next-action"));
  await editor().waitFor();
  await fill("export function countWords(text) { while (true) {} }");
  await run();
  await keyActivate(page.getByRole("button", { name: /Cancel run/ }));
  await keyActivate(page.getByRole("tab", { name: "Tests", exact: true }));
  await page.getByText("Run cancelled.", { exact: true }).waitFor();
  await hasPrimary("Run tests");

  const good =
    "export function countWords(text) { return text.trim() ? text.trim().split(/\\s+/).length : 0; }";
  await fill(good);
  await run();
  await hasPrimary("Push to #1");
  assert.equal(
    await editor().evaluate((el) => el === document.activeElement),
    true,
  );
  await push();
  await hasPrimary("Review and merge #1");
  assert.equal(
    await page.locator(".ide-panel a.ide-run:not(.secondary)").count(),
    0,
  );

  // Resume the eligible PR before editing: there is no local RunView on this mount.
  await page.reload();
  await editor().waitFor();
  await hasPrimary("Review and merge #1");
  // Editing invalidates the visual promotion immediately and the PR's real gate after saving.
  await editor().press("End");
  await editor().press("Space");
  await hasPrimary("Run tests");
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.goto(`${origin}/pulls/QUICK-2/1`);
  await page.getByText(/code changed after push/).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Merge pull request", exact: true })
      .count(),
    0,
  );
  assert.equal(await page.locator(".outcome-actions").count(), 0);
  await keyActivate(page.locator(".pull-next-action"));
  await editor().waitFor();
  assert.match(await editor().innerText(), /countWords/);
  await fill(good);
  await run();
  await push();
  await hasPrimary("Review and merge #1");
  await keyActivate(page.locator(".ide-actions a.ide-run"));
  await keyActivate(
    page.getByRole("button", { name: "Merge pull request", exact: true }),
  );
  await page.locator(".practice-actions .btn.start").waitFor();
  assert.equal(await page.locator(".merge-box.merged").count(), 0);
  assert.equal(await page.locator(".practice-actions .btn.start").count(), 1);
  assert.match(await page.locator(".practice-next").innerText(), /Next:/);
  await keyActivate(
    page.getByRole("button", { name: "Share result", exact: true }),
  );
  assert.equal(
    await page.getByLabel("Include my code", { exact: false }).isChecked(),
    false,
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Share result", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );

  // Explicit Resolve survives a correcting push; it is distinct from the CI gate.
  await work("FN-1");
  const reference = SEED_ISSUES.find((i) => i.id === "frequency-map")!.private!
    .reference["frequency_map.py"];
  await fill('print("debug")\n' + reference);
  await push();
  await hasPrimary("Resolve findings on #1");
  await fill(reference);
  await push();
  await hasPrimary("Resolve findings on #1");
  await keyActivate(page.locator(".ide-actions a.ide-run"));
  assert.equal(
    await page
      .getByRole("button", { name: "Merge pull request", exact: true })
      .count(),
    0,
  );
  await keyActivate(
    page.getByRole("button", { name: "Resolve", exact: true }).first(),
  );
  await page
    .getByRole("button", { name: "Merge pull request", exact: true })
    .waitFor();

  // Resume keeps source and tab selection; Escape then Tab exits the editor.
  await work("QUICK-3");
  await fill("export function countWords(text: string): number { return 42; }");
  await page.getByText("Saved", { exact: true }).waitFor();
  await keyActivate(page.getByRole("tab", { name: /count-words.test.ts/ }));
  await page.goto(`${origin}/issues`);
  await work("QUICK-3");
  assert.equal(
    await page
      .getByRole("tab", { name: /count-words.test.ts/ })
      .getAttribute("aria-selected"),
    "true",
  );
  await keyActivate(
    page.getByRole("tab", { name: "count-words.ts", exact: true }),
  );
  assert.match(await editor().innerText(), /return 42/);
  await editor().focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  assert.equal(
    await editor().evaluate((el) => el === document.activeElement),
    false,
  );
  console.log(
    "PASS: arrival, failure, cancel, green, stale-code recovery, review/merge, next/share, explicit Resolve, pause/resume and keyboard escape",
  );
} finally {
  await context.close();
  await browser.close();
}
