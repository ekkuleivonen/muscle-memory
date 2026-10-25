/** Reversible ENG-328 presentation checks against a running app. Synthetic context only.
 * LOOP_ORIGIN=http://localhost:3128 node --import tsx tools/browser/challenge-presentation-check.ts
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { library } from "../../apps/web/lib/library";
import { catalog } from "../../apps/web/lib/test-fixtures";

const origin = process.env.LOOP_ORIGIN ?? "http://localhost:3000";
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
await context.route("**/ingest/**", (route) =>
  route.fulfill({ status: 410, body: "synthetic-integration-qa" }),
);
await context.addInitScript(() => {
  if (!localStorage.getItem("muscle-memory.profile"))
    localStorage.setItem(
      "muscle-memory.profile",
      JSON.stringify({
        version: "2",
        createdAt: new Date().toISOString(),
        stealth: true,
        profile: {},
      }),
    );
});
const page = await context.newPage();
page.setDefaultTimeout(20_000);
try {
  await page.goto(`${origin}/issues`);
  await page
    .getByRole("button", { name: "I'm 16 or older and accept", exact: true })
    .click();
  await page.getByRole("searchbox", { name: "Search", exact: true }).waitFor();
  assert.match(await page.title(), /^Explore/);
  await page
    .locator("details.menu")
    .filter({ has: page.locator("summary", { hasText: "Display" }) })
    .locator("summary")
    .click();
  assert.equal(
    await page
      .getByRole("menuitemradio", { name: "Status", exact: true })
      .count(),
    0,
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("/");
  await page.keyboard.type("lang:javascript difficulty:easy project:shop");
  await page.keyboard.press("Enter");
  await page.waitForURL(/q=/);
  assert.ok((await page.locator("a[data-row]").count()) > 0);
  for (const row of await page.locator("a[data-row]").all()) {
    assert.match(await row.innerText(), /JavaScript/);
    assert.match(await row.innerText(), /easy/);
  }
  // Published requirements and visible examples are literal; CI-only examples stay out.
  const issue = library(catalog).findIssue("QUICK-2")!;
  await page.goto(`${origin}/issues/QUICK-2`);
  await page
    .getByRole("heading", { name: "Goal and requirements", exact: true })
    .waitFor();
  const examples = page.locator(".challenge-examples li");
  assert.equal(await examples.count(), issue.criteria.length);
  const pairs = await examples.evaluateAll((nodes) =>
    nodes.map((node) =>
      [...node.querySelectorAll("pre")].map((pre) =>
        JSON.parse(pre.textContent!),
      ),
    ),
  );
  assert.deepEqual(
    pairs,
    issue.criteria.map((c) => [c.input, c.expected]),
  );
  assert.equal(await page.locator(".status-trigger").count(), 0);
  assert.equal(await page.locator(".issue-pulls").count(), 0);
  assert.equal(
    await page.locator(".challenge-context, .timeline, .issue-thread").count(),
    0,
  );
  const start = page
    .getByRole("link", { name: "Practice", exact: true })
    .last();
  await start.focus();
  await page.keyboard.press("Enter");
  const editor = page.locator(
    '.practice-editor:not([hidden]) .cm-content[contenteditable="true"]',
  );
  await editor.waitFor();
  assert.equal(
    await editor.evaluate((el) => el === document.activeElement),
    true,
  );
  const workingPairs = await page
    .locator(".practice-challenge .challenge-examples li")
    .evaluateAll((nodes) =>
      nodes.map((node) =>
        [...node.querySelectorAll("pre")].map((pre) =>
          JSON.parse(pre.textContent!),
        ),
      ),
    );
  assert.deepEqual(workingPairs, pairs);
  await editor.fill("export function countWords(text) { return 123; }");
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.goto(`${origin}/issues?q=is:todo&group=status`);
  await page.getByText(/board status filter/).waitFor();
  await page.goto(`${origin}/work/QUICK-2`);
  await editor.waitFor();
  assert.match(await editor.innerText(), /return 123/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    await page.locator(".practice-challenge .challenge-examples li").count(),
    issue.criteria.length,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.goto(`${origin}/issues?q=lang:sql`);
  await page.getByRole("searchbox", { name: "Search", exact: true }).waitFor();
  assert.equal(await page.locator("a[data-row]").count(), 3);
  for (const row of await page.locator("a[data-row]").all())
    assert.match(await row.innerText(), /SQL/);
  console.log(
    "PASS: catalog keyboard search/filter, legacy status URLs, exact visible examples, no detail status/PR controls, editor focus/resume and mobile challenge view",
  );
} finally {
  await context.close();
  await browser.close();
}
