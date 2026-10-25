/** Synthetic integration QA; every upload is intercepted and contexts opt out of research. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { LEGAL_VERSION } from "../../apps/web/lib/legal";
import { SEED_ISSUES } from "../../content/seed";
import { decodeOutcome } from "../../apps/web/lib/outcome";
import { codeFromHash, decodeCode } from "../../apps/web/lib/share";

const origin = process.env.LOOP_ORIGIN ?? "http://127.0.0.1:3217";
const shots =
  process.env.INTEGRATION_SCREENSHOTS ?? "/tmp/mm-round2-integrated";
await mkdir(shots, { recursive: true });
const browser = await chromium.launch();
const contexts: import("playwright").BrowserContext[] = [];
const results: string[] = [];
async function context(consented = true) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  contexts.push(ctx);
  await ctx.route("**/ingest/**", (r) =>
    r.fulfill({ status: 410, body: "synthetic-integration-qa" }),
  );
  if (!consented) return ctx;
  await ctx.addCookies([{ name: "mm_consent", value: LEGAL_VERSION, url: origin }]);
  await ctx.addInitScript((version) => {
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
  return ctx;
}
function passed(message: string) {
  results.push(message);
  console.log("PASS", message);
}
try {
  const ctx = await context();
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(90_000);
  const editor = () =>
    page.locator('.practice-editor .cm-content[contenteditable="true"]');
  const records = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("muscle-memory-local-practice");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<any[]>((resolve, reject) => {
          const request = db
            .transaction("records")
            .objectStore("records")
            .getAll();
          request.onsuccess = () =>
            resolve(request.result.map((r: any) => JSON.parse(r.payload)));
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    });
  await page.goto(`${origin}/challenges/JS-002`);
  await editor().waitFor();
  await page.getByRole("button", { name: "Submit", exact: false }).waitFor();
  await page.waitForFunction(
    () =>
      !document.querySelector<HTMLButtonElement>(
        ".practice-controls button:last-child",
      )?.disabled,
  );
  await editor().fill("export function countWords(text) { !!! }");
  await editor().press(
    process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
  );
  for (let i = 0; i < 150; i++) {
    if (
      (await records()).some(
        (r) =>
          r.type === "practice.run" &&
          r.data.status === "user-error",
      )
    )
      break;
    await page.waitForTimeout(100);
  }
  const first = (await records()).find(
    (r) =>
      r.type === "practice.run" && r.data.status === "user-error",
  );
  assert.ok(first, "first Submit genuinely failed compilation");
  assert.equal(
    await page
      .getByRole("button", { name: "Share result", exact: true })
      .count(),
    0,
  );
  const seed = SEED_ISSUES.find((i) => i.id === "word-count-javascript")!;
  const [path, solution] = Object.entries(seed.private!.reference)[0] as [string, string];
  await editor().fill(solution);
  await editor().press(
    process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
  );
  await page
    .getByRole("button", { name: "Share result", exact: true })
    .waitFor();
  const done = (await records()).filter((r) => r.type === "practice.completed");
  assert.equal(done.length, 1);
  passed("compile error cannot share; actual later completion mounts sharing");
  await page.getByRole("button", { name: "Share result", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share your result" });
  const optIn = dialog.getByRole("checkbox");
  assert.equal(await optIn.isChecked(), false);
  await dialog.getByRole("button", { name: "Copy link", exact: true }).click();
  await dialog.getByRole("button", { name: "Copied", exact: true }).waitFor();
  const noCode = (
    await page.evaluate(() => navigator.clipboard.readText())
  ).match(/https?:\/\/\S+/)![0];
  assert.equal(new URL(noCode).hash, "");
  const card = decodeOutcome(new URL(noCode).pathname.split("/").at(-1)!);
  assert.ok(card);
  assert.equal(card.f, null);
  assert.equal(card.n, 2);
  assert.equal(card.rv, done[0].challengeRevision.replace("sha256:", ""));
  passed(
    "incomplete first check stays null; minimal card pins exact completion and excludes code by default",
  );
  await optIn.check();
  await dialog.getByRole("button", { name: "Copy link", exact: true }).click();
  await dialog.getByRole("button", { name: "Copied", exact: true }).waitFor();
  const withCode = (
    await page.evaluate(() => navigator.clipboard.readText())
  ).match(/https?:\/\/\S+/)![0];
  assert.deepEqual(await decodeCode(codeFromHash(new URL(withCode).hash)!), [
    { path, text: solution },
  ]);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Share result", exact: true }).click();
  assert.equal(await optIn.isChecked(), false);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  // The card is the recorded completion: later edits and a reload leave it, and its code, as
  // the completing run checked them.
  await editor().fill(solution + "\n// later synthetic edit");
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.reload();
  await editor().waitFor();
  assert.match(await editor().innerText(), /later synthetic edit/);
  await page.getByRole("button", { name: "Share result", exact: true }).click();
  await optIn.check();
  await dialog.getByRole("button", { name: "Copy link", exact: true }).click();
  await dialog.getByRole("button", { name: "Copied", exact: true }).waitFor();
  const afterEdit = (
    await page.evaluate(() => navigator.clipboard.readText())
  ).match(/https?:\/\/\S+/)![0];
  assert.deepEqual(await decodeCode(codeFromHash(new URL(afterEdit).hash)!), [
    { path, text: solution },
  ]);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  passed(
    "opt-in resets; code comes from the completing artifact, not later edits, across a reload",
  );
  const recipient = await context(false);
  const fresh = await recipient.newPage();
  fresh.setDefaultTimeout(90_000);
  await fresh.goto(noCode);
  assert.equal(await fresh.locator(".shared-code").count(), 0);
  await fresh.goto(withCode);
  await fresh.locator(".shared-code summary").click();
  assert.equal(
    await fresh.locator(".shared-code pre code").innerText(),
    solution,
  );
  assert.doesNotMatch(
    await fresh.locator("body").innerText(),
    /without AI|faster than|percentile/i,
  );
  await fresh
    .getByRole("link")
    .filter({ hasText: /JS-002/ })
    .last()
    .click();
  await fresh
    .getByRole("button", { name: "Start JS-002 yourself", exact: false })
    .click();
  const freshEditor = fresh.locator(
    '.practice-editor .cm-content[contenteditable="true"]',
  );
  await freshEditor.waitFor();
  assert.notEqual(await freshEditor.innerText(), solution);
  assert.equal(
    await fresh
      .getByRole("button", { name: "Share result", exact: true })
      .count(),
    0,
  );
  passed(
    "fresh recipients see only opted-in solution and start their own independent attempt",
  );
  await page.goto(`${origin}/challenges/SQL-002`);
  await editor().waitFor();
  const table = page.locator(".practice-challenge table").first();
  assert.deepEqual(await table.locator("thead th").allTextContents(), [
    "Table",
    "Column",
    "Type",
    "Meaning",
  ]);
  assert.equal(await table.locator("tbody tr").count(), 6);
  assert.match(await table.innerText(), /payments/);
  assert.match(await table.innerText(), /order_id/);
  assert.equal(await editor().count(), 1);
  assert.equal(
    await page.getByRole("combobox", { name: "Editable source" }).count(),
    0,
  );
  await page.screenshot({ path: `${shots}/sql-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${shots}/sql-mobile.png`, fullPage: true });
  assert.ok(await table.isVisible());
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  passed(
    "SQL-002 has real headers/cells and one editor on desktop/mobile without page overflow",
  );
} finally {
  await writeFile(`${shots}/results.json`, JSON.stringify(results, null, 2));
  for (const ctx of contexts) await ctx.close();
  await browser.close();
}
