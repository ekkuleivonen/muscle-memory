/** ENG-306 synthetic UI acceptance. No real participant data or research uploads.
 * POLISH_ORIGIN=http://localhost:3060 POLISH_BROWSER=chromium|webkit node --import tsx tools/browser/player-polish-check.ts
 * Text zoom is a deterministic 200% font-size fixture, not an actual device/OS study.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit, type Page } from "playwright";
import { readChallenge } from "../../packages/content/source";
import { LEGAL_VERSION } from "../../apps/web/lib/legal";

const origin = process.env.POLISH_ORIGIN ?? "http://localhost:3060";
const engine = process.env.POLISH_BROWSER ?? "chromium";
assert.ok(engine === "chromium" || engine === "webkit");
const browser = await (engine === "webkit" ? webkit : chromium).launch();
const output = process.env.POLISH_ARTIFACTS ?? "/tmp/mm-eng306";
await mkdir(output, { recursive: true });
const receipts: object[] = [];
let uploads = 0;
const correct = readChallenge("JS-002").private.solution;

async function ready(page: Page) {
  // Phones get the desktop-first notice; this check solves on them anyway (ENG-386).
  const solveHere = page.getByRole("button", { name: "Solve here anyway" });
  await page
    .locator(".practice-editor:not([hidden]) .cm-content")
    .or(solveHere)
    .filter({ visible: true })
    .first()
    .waitFor();
  if (await solveHere.isVisible()) await solveHere.click();
  await page.locator(".practice-editor:not([hidden]) .cm-content").waitFor();
  await page.waitForFunction(
    () =>
      !document.querySelector<HTMLButtonElement>(
        ".practice-controls button:last-child",
      )?.disabled,
  );
}

try {
  for (const width of engine === "webkit" ? [390] : [1280, 320, 390]) {
    const mobile = width < 760;
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: mobile,
      isMobile: mobile,
    });
    await context.route("**/ingest/**", (route) => {
      uploads++;
      return route.fulfill({ status: 410, body: "isolated-synthetic-qa" });
    });
    await context.addCookies([
      { name: "mm_consent", value: LEGAL_VERSION, url: origin },
    ]);
    await context.addInitScript((version) => {
      if (location.origin === "null") return;
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
    page.setDefaultTimeout(60000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto(`${origin}/challenges`);
      await page.locator(".picker-title").first().waitFor();
      if (mobile) {
        const clipped = () =>
          page
            .locator(".picker-title")
            .evaluateAll(
              (nodes) =>
                nodes.filter((n) => n.scrollWidth > n.clientWidth + 1).length,
            );
        assert.equal(await clipped(), 0, `${width}px picker titles clipped`);
        await page.addStyleTag({
          content: ".picker-title { font-size: 200% !important; }",
        });
        assert.equal(
          await clipped(),
          0,
          `${width}px titles clipped at 200% text size`,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await page.screenshot({
          path: `${output}/${engine}-${width}-titles-text200.png`,
        });
      }
      await page.goto(`${origin}/challenges/JS-002`);
      await ready(page);
      const editor = page.locator(".practice-editor:not([hidden]) .cm-content");
      const originalEditor = await editor.elementHandle();
      const nav = page.getByRole("navigation", {
        name: "Practice panes",
        exact: true,
      });
      let tabFocusEnabled = false;
      async function move(to: "Challenge" | "Code" | "Feedback") {
        if (mobile)
          await nav.getByRole("button", { name: to, exact: true }).click();
        else {
          if (
            await editor.evaluate((n) => n.contains(document.activeElement))
          ) {
            if (!tabFocusEnabled) {
              // Escape intentionally simplifies a selection. Use the documented toggle
              // when testing a preserved range, then Tab leaves the editor.
              const range = await page.evaluate(() =>
                getSelection()?.toString(),
              );
              await page.keyboard.press(
                process.platform === "darwin" ? "Alt+Shift+m" : "Control+m",
              );
              assert.equal(
                await page.evaluate(() => getSelection()?.toString()),
                range,
              );
              tabFocusEnabled = true;
            }
            await page.keyboard.press("Tab");
          }
          await page.keyboard.press(
            { Challenge: "1", Code: "2", Feedback: "3" }[to],
          );
        }
      }
      if (mobile) {
        await move("Code");
        assert.equal(
          await editor.evaluate((n) => n === document.activeElement),
          true,
        );
      }
      const starter = await editor.innerText();
      await editor.fill(
        starter +
          "\n" +
          Array.from(
            { length: 70 },
            (_, i) => `// navigation context ${String(i).padStart(5, "0")}`,
          ).join("\n"),
      );
      await editor.press(
        process.platform === "darwin" ? "Meta+End" : "Control+End",
      );
      await editor.press("Shift+ArrowLeft");
      await editor.press("Shift+ArrowLeft");
      await editor.press("Shift+ArrowLeft");
      const selection = await page.evaluate(() => getSelection()?.toString());
      const scroll = await page
        .locator(".cm-scroller")
        .evaluate((n) => n.scrollTop);
      assert.ok(selection?.length, "selection fixture is not empty");
      assert.ok(scroll > 0, "editor is internally scrolled");
      await page.waitForFunction(() => {
        const place = JSON.parse(
          localStorage.getItem("muscle-memory.practice-view") ?? "[]",
        )[0]?.place;
        return place?.ranges?.some(
          (r: { anchor: number; head: number }) => r.anchor !== r.head,
        );
      });
      const savedSelection = await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("muscle-memory.practice-view") ?? "[]",
          )[0]?.place,
      );
      const beforeSavedAt = await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("muscle-memory.practice-view") ?? "[]",
          )[0]?.savedAt,
      );
      for (let i = 0; i < 3; i++) {
        await move("Feedback");
        await move("Challenge");
        await move("Code");
      }
      assert.equal(
        await originalEditor!.evaluate((n) => n.isConnected),
        true,
        "editor was unmounted",
      );
      assert.equal(
        await editor.evaluate((n) => n === document.activeElement),
        true,
      );
      if (
        (await page.evaluate(() => getSelection()?.toString())) !== selection
      ) {
        // Give CodeMirror and the existing one-second local view save time to settle.
        // Retain the exact selection assertion below: this diagnoses, not masks, a loss.
        await page.waitForTimeout(1200);
        console.log(
          JSON.stringify({
            selectionDiagnostic: true,
            expected: selection,
            actual: await page.evaluate(() => getSelection()?.toString()),
            before: savedSelection,
            after: await page.evaluate(
              () =>
                JSON.parse(
                  localStorage.getItem("muscle-memory.practice-view") ?? "[]",
                )[0]?.place,
            ),
          }),
        );
      }
      assert.equal(
        await page.evaluate(() => getSelection()?.toString()),
        selection,
        "selection changed after pane navigation",
      );
      await page.waitForFunction(
        (before) =>
          JSON.parse(
            localStorage.getItem("muscle-memory.practice-view") ?? "[]",
          )[0]?.savedAt !== before,
        beforeSavedAt,
      );
      const afterSavedSelection = await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("muscle-memory.practice-view") ?? "[]",
          )[0]?.place,
      );
      assert.deepEqual(
        afterSavedSelection.ranges,
        savedSelection.ranges,
        "CodeMirror range changed",
      );
      assert.ok(
        Math.abs(
          (await page.locator(".cm-scroller").evaluate((n) => n.scrollTop)) -
            scroll,
        ) <= 2,
        "editor scroll changed",
      );
      // Escape's existing simplify-selection command is intentional. Measure the caret
      // after that command, then assert that navigation does not move it again.
      await editor.press("Escape");
      assert.equal(await page.evaluate(() => getSelection()?.toString()), "");
      await page.waitForFunction(() => {
        const p = JSON.parse(
          localStorage.getItem("muscle-memory.practice-view") ?? "[]",
        )[0]?.place;
        return p?.ranges?.every(
          (r: { anchor: number; head: number }) => r.anchor === r.head,
        );
      });
      const caret = await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("muscle-memory.practice-view") ?? "[]",
          )[0]?.place.ranges,
      );
      const caretSavedAt = await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("muscle-memory.practice-view") ?? "[]",
          )[0]?.savedAt,
      );
      if (mobile) {
        await move("Feedback");
        await move("Code");
      } else {
        await page.keyboard.press("Tab");
        await page.keyboard.press("3");
        await page.keyboard.press("2");
      }
      await page.waitForFunction(
        (before) =>
          JSON.parse(
            localStorage.getItem("muscle-memory.practice-view") ?? "[]",
          )[0]?.savedAt !== before,
        caretSavedAt,
      );
      assert.deepEqual(
        await page.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem("muscle-memory.practice-view") ?? "[]",
            )[0]?.place.ranges,
        ),
        caret,
        "caret moved after pane navigation",
      );
      if (mobile) {
        await move("Challenge");
        // Set a reading offset consistently: mobile WebKit has no wheel API.
        await page.evaluate(() => window.scrollBy({ top: 200, behavior: "instant" }));
        await page.waitForFunction(() => scrollY > 100);
        const reading = await page.evaluate(() => scrollY);
        await move("Feedback");
        await move("Challenge");
        assert.ok(
          Math.abs((await page.evaluate(() => scrollY)) - reading) < 3,
          "description reading place changed",
        );
        await nav.getByRole("button", { name: "Code", exact: true }).focus();
        await page.keyboard.press("Enter");
        assert.equal(
          await editor.evaluate((n) => n === document.activeElement),
          true,
          "keyboard pane control failed",
        );
        await nav.getByRole("button", { name: "Code", exact: true }).focus();
        await page.keyboard.press("3");
        assert.equal(
          await page.locator("#practice-feedback .pane-body").evaluate(
            (n) => n === document.activeElement,
          ),
          true,
          "pane shortcut from navigation failed",
        );
        await page.keyboard.press("2");
        assert.equal(await editor.evaluate((n) => n === document.activeElement), true);
      }
      await page.getByRole("button", { name: /^Submit/ }).click();
      await page
        .locator(".check-headline")
        .filter({ hasText: /failed/ })
        .waitFor();
      if (mobile) await move("Feedback");
      assert.equal(
        await page.locator(".hidden-checks .ci-hidden-summary > li").count(),
        1,
      );
      assert.equal(
        await page
          .locator(".hidden-checks details")
          .evaluate((n) => (n as HTMLDetailsElement).open),
        false,
      );
      const safeHiddenRows = await page
        .locator(".hidden-checks .ci-failing > li")
        .count();
      assert.equal(safeHiddenRows, 12);
      assert.equal(
        await page.locator(".hidden-checks .ci-failing > li:visible").count(),
        0,
      );
      assert.equal(
        await page
          .locator(".check-feedback > .ci-failing > li:visible")
          .count(),
        3,
      );
      await page.screenshot({
        path: `${output}/${engine}-${width}-compact-failure.png`,
      });
      await page.locator(".hidden-checks summary").click();
      assert.equal(
        await page.locator(".hidden-checks .ci-failing > li:visible").count(),
        safeHiddenRows,
      );
      await move("Code");
      await editor.fill(
        (await editor.innerText()) + "\n// edited after the submission",
      );
      await page
        .getByText("You've edited the code since the last submission.", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page.locator(".hidden-checks").count(),
        0,
        "stale diagnosis remained current",
      );
      assert.equal(await page.locator(".practice-next").count(), 0);
      assert.equal(
        await page
          .getByText("Last run output — code edited since", { exact: true })
          .count(),
        1,
      );
      await editor.fill(correct);
      await editor.press(
        process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
      );
      await page
        .getByRole("heading", { name: "Next challenge", exact: true })
        .waitFor();
      if (mobile) await move("Feedback");
      assert.equal(await page.getByText("Done.", { exact: true }).count(), 1);
      const next = page.getByRole("link", {
        name: "Next challenge →",
        exact: true,
      });
      const href = await next.getAttribute("href");
      assert.ok(href && href !== "/challenges/JS-002");
      await next.click();
      await page.waitForURL(`${origin}${href}`);
      await ready(page);
      assert.equal(new URL(page.url()).pathname, href);
      assert.notEqual(
        await page.locator(".cm-content").innerText(),
        correct,
        "next challenge reused previous code",
      );
      if (mobile) {
        await page.goto(`${origin}/challenges/PY-003`);
        await page
          .getByRole("heading", {
            name: "Herbarium import creates duplicate species from the tally sheet",
            exact: true,
          })
          .waitFor();
        await page.addStyleTag({
          content:
            ".practice-challenge h1, .practice-nav button { font-size: 200% !important; }",
        });
        assert.equal(
          await page
            .locator(".practice-challenge h1")
            .evaluate((n) => n.scrollWidth > n.clientWidth + 1),
          false,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
      }
      assert.deepEqual(errors, [], "browser errors");
      receipts.push({
        engine,
        width,
        mobile,
        pickerText200: mobile,
        longPracticeTitleText200: mobile,
        repeatedNavigation: 3,
        editorMounted: true,
        selectionPreserved: true,
        caretPreserved: true,
        editorScrollPreserved: true,
        descriptionScrollPreserved: mobile,
        hiddenFailures: safeHiddenRows,
        defaultVisibleHiddenRows: 0,
        safeDetailsRetained: true,
        staleMarked: true,
        correctedCompletedNext: true,
        keyboard: true,
      });
    } catch (error) {
      await page.screenshot({
        path: `${output}/${engine}-${width}-failure.png`,
        fullPage: true,
      });
      console.error("Failure at", page.url(), error);
      throw error;
    } finally {
      await context.close();
    }
  }
  await writeFile(
    `${output}/${engine}-receipts.json`,
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        receipts,
        uploadsIntercepted: uploads,
        syntheticUploadsBlocked: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      engine,
      cases: receipts.length,
      passed: true,
      uploadsIntercepted: uploads,
      output,
    }),
  );
} finally {
  await browser.close();
}
