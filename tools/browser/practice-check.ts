/** Real sandbox/runtime + storage regression for ENG-328. Synthetic participant only.
 * LOOP_ORIGIN=http://localhost:3128 node --import tsx tools/browser/practice-check.ts
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { codeRevision, toRecord } from "../../packages/domain/workspace";
import { catalog } from "../../apps/web/lib/test-fixtures";
import { library } from "../../apps/web/lib/library";
import { editableFiles } from "../../packages/content/model";
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
  // The normalized TypeScript challenge is really one editable source and still runs.
  await page.goto(`${origin}/work/SHOP-8`);
  await ready();
  assert.equal(await page.locator(".practice-editor").count(), 1);
  assert.equal(
    await page.getByRole("combobox", { name: "Editable source" }).count(),
    0,
  );
  assert.equal(
    await page
      .locator(".practice-context, .practice-requirements, [role=tablist]")
      .count(),
    0,
  );
  const shop = library(catalog).findIssue("SHOP-8")!;
  const shopSeed = SEED_ISSUES.find((i) => i.id === shop.slug)!;
  await editor().fill(Object.values(shopSeed.private.reference)[0]);
  await submit();
  await page
    .getByRole("heading", { name: "Next challenge", exact: true })
    .waitFor();
  assert.equal((await finished()).length, 3);

  // Historical multi-file bundles remain intact, but are never made one-file by hiding a source.
  const legacyRevision =
    "sha256:675596eb25cb85f7ed035b3f24ad21a489ffc4b37bb5214aa3ef196ba9b0c068";
  const beforeHistorical = (await records()).filter(
    (v) => v.type === "observation.workspace.opened",
  ).length;
  await page.goto(`${origin}/work/SHOP-8?revision=${legacyRevision}`);
  await page
    .getByRole("heading", {
      name: "This older version is not supported in one-file practice",
    })
    .waitFor();
  assert.equal(await page.locator(".cm-content").count(), 0);
  assert.equal(
    (await records()).filter((v) => v.type === "observation.workspace.opened")
      .length,
    beforeHistorical,
  );
  const legacy = catalog.revisions[legacyRevision];
  const participantId = all[0].participantId;
  const previousOpen = all.find(
    (v) => v.type === "observation.workspace.opened",
  )!;
  async function seedLegacy(suffix: string) {
    const sourceId = `legacy-recovery-${suffix}`;
    const files = Object.fromEntries(
      Object.entries(editableFiles(legacy.workspace)).map(([path, file]) => [
        path,
        {
          mediaType: "text/typescript",
          text:
            file.text +
            (path === legacy.workspace.entry
              ? "\n// LEGACY_ENTRY_SENTINEL"
              : "\n// LEGACY_HELPER_SENTINEL"),
        },
      ]),
    );
    const artifact = toRecord(codeRevision(participantId, sourceId, 1, files));
    const observed = {
      ...previousOpen,
      observationId: `${sourceId}.1`,
      source: { id: sourceId, sequence: 1 },
      occurredAt: new Date().toISOString(),
      issue: shop.slug,
      issueRevision: legacyRevision,
      data: {
        ...previousOpen.data,
        revision: 1,
        codeArtifactId: artifact.recordId,
      },
    };
    const fixture = [
      artifact,
      {
        recordId: observed.observationId,
        kind: "observation",
        participantId,
        payload: JSON.stringify(observed),
      },
    ];
    await page.evaluate(async (fixture) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("muscle-memory-local-practice");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("workspace", "readwrite");
          for (const r of fixture) tx.objectStore("workspace").add(r);
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    }, fixture);
    return JSON.parse(artifact.payload);
  }
  const retainedEntry = await seedLegacy("entry");
  const beforeChoice = (await records()).filter(
    (v) =>
      v.type.startsWith("observation.workspace.") ||
      v.type === "artifact.code-revision",
  ).length;
  await page.goto(`${origin}/work/SHOP-8`);
  await page.getByRole("region", { name: "Saved version recovery" }).waitFor();
  assert.equal(await editor().count(), 0);
  assert.equal(
    (await records()).filter(
      (v) =>
        v.type.startsWith("observation.workspace.") ||
        v.type === "artifact.code-revision",
    ).length,
    beforeChoice,
    "no new workspace records before a lossy restoration choice",
  );
  await activate(
    page.getByRole("button", { name: "Restore saved entry only", exact: true }),
  );
  await ready();
  assert.match(await editor().innerText(), /LEGACY_ENTRY_SENTINEL/);
  await page.getByText("Saved", { exact: true }).waitFor();
  assert.deepEqual(
    (await records()).find((v) => v.artifactId === retainedEntry.artifactId),
    retainedEntry,
  );
  await page.reload();
  await ready();
  assert.match(await editor().innerText(), /LEGACY_ENTRY_SENTINEL/);
  // Explicit starter choice appends a new source without rewriting old entry/helper artifacts.
  await page.goto(`${origin}/profile`);
  const retainedStarter = await seedLegacy("starter");
  await page.goto(`${origin}/work/SHOP-8`);
  await page.getByRole("region", { name: "Saved version recovery" }).waitFor();
  await shot("practice-version-recovery");
  await activate(
    page.getByRole("button", { name: "Use current starter", exact: true }),
  );
  await ready();
  assert.doesNotMatch(await editor().innerText(), /LEGACY_ENTRY_SENTINEL/);
  assert.deepEqual(
    (await records()).find((v) => v.artifactId === retainedStarter.artifactId),
    retainedStarter,
  );

  // SQL is a first-class one-file challenge: schema is public; harness and test code stay internal.
  await page.goto(`${origin}/work/DATA-3`);
  await ready();
  await page.getByText("Data schema", { exact: true }).waitFor();
  assert.match(
    await page
      .locator(".practice-challenge details")
      .filter({ has: page.getByText("Data schema", { exact: true }) })
      .innerText(),
    /CREATE TABLE/i,
  );
  assert.equal(await page.locator(".practice-editor").count(), 1);
  const sql = library(catalog).findIssue("DATA-3")!;
  const sqlSeed = SEED_ISSUES.find((i) => i.id === sql.slug)!;
  await editor().fill(Object.values(sqlSeed.private.reference)[0]);
  await submit();
  await page
    .getByRole("heading", { name: "Next challenge", exact: true })
    .waitFor();
  assert.equal((await finished()).length, 4);
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
  // Next challenge uses client navigation: it must open a fresh session for the new key.
  await page.setViewportSize({ width: 1280, height: 900 });
  const nextLink = page.locator(".practice-next .btn.start");
  const nextHref = await nextLink.getAttribute("href");
  assert.ok(nextHref);
  await activate(nextLink);
  await page.waitForURL(`${origin}${nextHref}`);
  await ready();
  const nextKey = new URL(page.url()).pathname.split("/").at(-1)!;
  const nextIssue = library(catalog).findIssue(nextKey)!;
  assert.match(
    await page.locator(".practice-header > span").innerText(),
    new RegExp(nextKey),
  );
  assert.ok(
    (await records()).some(
      (v) =>
        v.type === "observation.workspace.opened" &&
        v.issue === nextIssue.slug &&
        v.issueRevision === nextIssue.revision,
    ),
  );
  console.log(
    "PASS: actual full-suite Submit, failed hidden checks, cancel/retry, public-only green, automatic completion, stale/edit/reload, atomic records, required-rule recovery, profile, one-file TypeScript/SQL, safe historical revision recovery, keyboard focus and mobile",
  );
} finally {
  await context.close();
  await browser.close();
}
