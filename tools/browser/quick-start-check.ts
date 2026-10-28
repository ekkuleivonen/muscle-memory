/** The /start language picker: numbers 01–12 in one column, long titles wrapping under themselves,
 * and real keyboard and touch selection.
 * START_ORIGIN=http://localhost:3080 node --import tsx tools/browser/quick-start-check.ts
 * Synthetic only: a fresh browser with Python's first two challenges marked done, so Python offers
 * PY-003, the owner's long-title case. Every request off the origin, and ingest, is stopped in the
 * browser. Device emulation, Chromium.
 */
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";

const origin = process.env.START_ORIGIN ?? "http://localhost:3080";
const browser = await chromium.launch();
const log: string[] = [];
const step = (s: string) => {
  log.push(s);
  console.log(`  ✓ ${s}`);
};
const DONE = JSON.stringify({
  "PY-001": { attempt: "qa1", startedAt: "2026-10-27T10:00:00Z", completedAt: "2026-10-27T10:05:00Z", completions: 1 },
  "PY-002": { attempt: "qa2", startedAt: "2026-10-27T11:00:00Z", completedAt: "2026-10-27T11:05:00Z", completions: 1 },
});

async function open(width: number, height: number, touch = false): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
  await context.route((url) => url.origin !== origin, (route) => route.abort());
  await context.route("**/ingest/**", (route) => route.fulfill({ status: 410, body: "isolated-synthetic-qa" }));
  await context.addInitScript(`if (location.origin !== "null") localStorage.setItem("muscle-memory.progress", ${JSON.stringify(DONE)});`);
  const page = await context.newPage();
  await page.goto(`${origin}/start?lang=python`);
  await page.locator("#quick-start-0").waitFor();
  return page;
}
const focused = (page: Page) => page.evaluate("document.activeElement && document.activeElement.id");

// Layout at each width, including both sides of the 760 px and 600 px breakpoints.
for (const [width, height, touch] of [
  [1280, 800, false],
  [761, 900, false],
  [760, 900, false],
  [601, 900, false],
  [600, 900, false],
  [390, 844, true],
  [320, 640, true],
  [844, 390, true],
] as const) {
  const page = await open(width, height, touch);
  // A string, not a function: tsx would wrap named functions in a helper the page doesn't have.
  const m = (await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll(".t-keymenu .t-row")];
    const box = (e) => e.getBoundingClientRect();
    const numbers = rows.map((r) => r.children[1]);
    const names = rows.map((r) => r.querySelector(".t-row-name"));
    const leads = rows.map((r) => r.querySelector(".t-row-lead"));
    // Each line of the first row's title, as laid out.
    const range = document.createRange();
    range.selectNodeContents(names[0]);
    const lines = [...range.getClientRects()].map((r) => Math.round(r.left));
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      texts: numbers.map((n) => n.textContent),
      numberLefts: [...new Set(numbers.map((n) => Math.round(box(n).left)))],
      leadLefts: [...new Set(leads.map((l) => Math.round(box(l).left)))],
      nameLefts: [...new Set(names.map((n) => Math.round(box(n).left)))],
      clipped: names.some((n) => n.scrollWidth > n.clientWidth + 1),
      lines,
      leadLeft: Math.round(box(leads[0]).left),
      firstName: names[0].textContent,
    };
  })()`)) as {
    overflow: boolean;
    texts: string[];
    numberLefts: number[];
    leadLefts: number[];
    nameLefts: number[];
    clipped: boolean;
    lines: number[];
    leadLeft: number;
    firstName: string;
  };
  assert.equal(m.overflow, false, `${width}: no sideways scroll`);
  assert.deepEqual(m.texts, Array.from({ length: m.texts.length }, (_, i) => `${String(i + 1).padStart(2, "0")}.`), `${width}: 01, 02… numbering`);
  assert.equal(m.numberLefts.length, 1, `${width}: numbers in one column`);
  assert.equal(m.leadLefts.length, 1, `${width}: languages in one column`);
  assert.equal(m.nameLefts.length, 1, `${width}: challenges in one column`);
  assert.equal(m.clipped, false, `${width}: no title cut off`);
  assert.match(m.firstName!, /^PY-003 · Herbarium import creates duplicate species from the tally sheet$/);
  assert.equal(new Set(m.lines).size, 1, `${width}: every line of the PY-003 title starts at the title's own left edge (${m.lines})`);
  if (width > 600) assert.ok(m.lines[0] > m.leadLeft, `${width}: the title sits beside the language, never under it`);
  step(`${width}px: 01–${String(m.texts.length).padStart(2, "0")} in one column, PY-003 on ${m.lines.length} line(s) aligned under itself, nothing clipped or overflowing`);
  await page.context().close();
}

// Keyboard on the real page: Arrow, j/k, Home, End move; Enter and digits run.
{
  const page = await open(1280, 800);
  assert.equal(await focused(page), "quick-start-0", "the first row has focus on arrival");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("j");
  assert.equal(await focused(page), "quick-start-2");
  await page.keyboard.press("ArrowUp");
  assert.equal(await focused(page), "quick-start-1");
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  assert.equal(await focused(page), "quick-start-11", "up from the first wraps to the last");
  await page.keyboard.press("Home");
  assert.equal(await focused(page), "quick-start-0");
  await page.keyboard.press("End");
  assert.equal(await focused(page), "quick-start-11");
  const last = (await page.locator("#quick-start-11 .t-row-name").textContent())!.split(" · ")[0];
  await page.keyboard.press("Enter");
  await page.waitForURL(new RegExp(`/challenges/${last}$`));
  step(`↓ j ↑ k k Home End move the ❯ (wrapping at the ends); Enter on the last row starts ${last}`);
  await page.context().close();
}
for (let digit = 1; digit <= 9; digit++) {
  const page = await open(1280, 800);
  const key = (await page.locator(`#quick-start-${digit - 1} .t-row-name`).textContent())!.split(" · ")[0];
  await page.keyboard.press(String(digit));
  await page.waitForURL(new RegExp(`/challenges/${key}$`));
  await page.context().close();
}
step("digits 1–9 each start their row's challenge (shortcuts unchanged; rows 10–12 by arrows or Enter)");
{
  const page = await open(1280, 800);
  await page.keyboard.press("0");
  await page.waitForTimeout(300);
  assert.match(page.url(), /\/start\?lang=python$/, "0 runs nothing");
  step("0 runs nothing");
  await page.context().close();
}
// Touch: a tap starts that row.
{
  const page = await open(390, 844, true);
  const key = (await page.locator("#quick-start-3 .t-row-name").textContent())!.split(" · ")[0];
  await page.locator("#quick-start-3").tap();
  await page.waitForURL(new RegExp(`/challenges/${key}$`));
  step(`a tap on row 04 starts ${key}`);
  await page.context().close();
}

await browser.close();
console.log(`quick start: ${log.length} checks passed`);
