/** Reversible ENG-328 presentation checks against a running app. Synthetic context only.
 * LOOP_ORIGIN=http://localhost:3128 node --import tsx tools/browser/challenge-presentation-check.ts
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { library } from "../../apps/web/lib/library";
import { boardMove, boardRecord } from "../../packages/domain/board";
import { catalog } from "../../apps/web/lib/test-fixtures";

const origin = process.env.LOOP_ORIGIN ?? "http://localhost:3000";
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
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
  // Historical hint use is a profile fact, never a hint-text UI or an independence claim.
  const participantId = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("muscle-memory-local-practice");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<string>((resolve, reject) => {
        const r = db
          .transaction("settings")
          .objectStore("settings")
          .get("participantId");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  });
  assert.ok(participantId);
  const legacy = Object.entries(catalog.revisions).find(
    ([, r]) => r.issue === "frequency-map" && r.hints.length > 0,
  )!;
  const at = (minute: number) =>
    new Date(Date.UTC(2026, 9, 25, 1, minute)).toISOString();
  const base = {
    participantId,
    sourceId: "profile-browser-history",
    termsVersion: "2026-10-25.1",
    issue: { id: "frequency-map", revision: legacy[0] },
  };
  const hint = {
    recordId: "profile-browser-hint.1",
    participantId,
    kind: "observation",
    payload: JSON.stringify({
      type: "observation.workspace.hint",
      captureVersion: "workspace-capture-6.0.0",
      observationId: "profile-browser-hint.1",
      source: { id: "profile-browser-hint", sequence: 1 },
      occurredAt: at(1),
      issue: "frequency-map",
      issueRevision: legacy[0],
      data: {
        hint: legacy[1].hints[0].id,
        level: 1,
        text: "PRIVATE_HINT_TEXT",
      },
    }),
  };
  const oldMove = boardRecord(
    boardMove({
      ...base,
      sequence: 2,
      occurredAt: at(2),
      elapsedMs: 120000,
      data: {
        issueKey: "FN-1",
        from: "in-progress",
        to: "done",
        via: "keyboard",
        trigger: "pull-request-merged",
        pullRequest: 1,
        runId: "profile-old-run",
        onBoardBefore: 1,
        nudged: false,
      },
    }),
  );
  const old = {
    ...oldMove,
    payload: JSON.stringify({
      ...JSON.parse(oldMove.payload),
      captureVersion: "board-capture-7.1.0",
    }),
  };
  const replay = boardRecord(
    boardMove({
      ...base,
      sequence: 3,
      occurredAt: at(3),
      elapsedMs: 180000,
      data: {
        issueKey: "FN-1",
        from: "done",
        to: "in-progress",
        via: "pointer",
        trigger: "replay",
        onBoardBefore: 0,
        nudged: false,
      },
    }),
  );
  const checked = boardRecord(
    boardMove({
      ...base,
      sequence: 4,
      occurredAt: at(4),
      elapsedMs: 240000,
      data: {
        issueKey: "FN-1",
        from: "in-progress",
        to: "done",
        via: "keyboard",
        trigger: "checks-passed",
        pullRequest: 2,
        runId: "profile-new-run",
        onBoardBefore: 1,
        nudged: false,
      },
    }),
  );
  await page.evaluate(
    async (fixture) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("muscle-memory-local-practice");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("workspace", "readwrite");
          for (const row of fixture) tx.objectStore("workspace").add(row);
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    [hint, old, replay, checked],
  );
  await page.goto(`${origin}/profile`);
  await page.getByText(/1 built-in hint used/).waitFor();
  assert.equal(await page.getByText(/built-in hint used/).count(), 1);
  assert.doesNotMatch(
    await page.locator("main.content").innerText(),
    /PRIVATE_HINT_TEXT|without hints|No hints/,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  const retained = await page.evaluate(async (recordId) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("muscle-memory-local-practice");
      r.onsuccess = () => resolve(r.result);
    });
    try {
      return await new Promise<string>((resolve) => {
        const r = db
          .transaction("workspace")
          .objectStore("workspace")
          .get(recordId);
        r.onsuccess = () => resolve(r.result.payload);
      });
    } finally {
      db.close();
    }
  }, hint.recordId);
  assert.equal(retained, hint.payload);
  console.log(
    "PASS: catalog keyboard search/filter, legacy status URLs, exact visible examples, no detail status/PR controls, editor focus/resume, mobile challenge view and retained historical profile hint facts",
  );
} finally {
  await context.close();
  await browser.close();
}
