/** ENG-386 synthetic acceptance: phones read challenges, results and Stats; practice is desktop-first.
 * MOBILE_ORIGIN=http://localhost:3060 MOBILE_BROWSER=chromium|webkit node --import tsx tools/browser/mobile-check.ts
 * Device emulation (viewport, touch, coarse pointer), not a study on real devices. Uploads and
 * every other request off the origin are stopped in the browser and counted, never sent.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit, type Page } from "playwright";
import { LEGAL_VERSION } from "../../apps/web/lib/legal";
import { encodeOutcome } from "../../apps/web/lib/outcome";
import catalog from "../../content/catalog.json" with { type: "json" };

const origin = process.env.MOBILE_ORIGIN ?? "http://localhost:3060";
const engine = process.env.MOBILE_BROWSER ?? "chromium";
assert.ok(engine === "chromium" || engine === "webkit");
const output = process.env.MOBILE_ARTIFACTS ?? "/tmp/mm-eng386";
await mkdir(output, { recursive: true });
const KEY = "JS-002";
const live = (
  catalog as { challenges: { key: string; revision: string; title: string }[] }
).challenges.find((c) => c.key === KEY)!;
const card = encodeOutcome({
  v: 3,
  k: KEY,
  l: "javascript",
  rv: live.revision.replace(/^sha256:/, ""),
  o: { passed: 4, total: 4 },
  n: 1,
  c: "synthetic01",
});

const DEVICES = [
  { name: "phone-320", width: 320, height: 640, touch: true, phone: true },
  { name: "phone-390", width: 390, height: 844, touch: true, phone: true },
  {
    name: "phone-landscape",
    width: 844,
    height: 390,
    touch: true,
    phone: true,
  },
  { name: "tablet-820", width: 820, height: 1180, touch: true, phone: false },
  {
    name: "desktop-1280",
    width: 1280,
    height: 800,
    touch: false,
    phone: false,
  },
];

const browser = await (engine === "webkit" ? webkit : chromium).launch();
let blocked = 0;
const results: object[] = [];

async function noOverflow(page: Page, where: string) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    `${where}: horizontal overflow`,
  );
}

try {
  for (const device of DEVICES) {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      hasTouch: device.touch,
      isMobile: device.touch,
    });
    await context.route(
      (url) => url.origin !== origin && url.protocol.startsWith("http"),
      (route) => {
        blocked++;
        return route.abort();
      },
    );
    await context.route("**/ingest/**", (route) => {
      blocked++;
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
    const shot = (name: string) =>
      page.screenshot({
        path: `${output}/${engine}-${device.name}-${name}.png`,
      });
    const narrowBar = device.width <= 860;

    // A shared result shows its challenge and leads to it.
    await page.goto(`${origin}/r/${card}`);
    await page.getByText(live.title).first().waitFor();
    await noOverflow(page, `${device.name} /r`);
    await shot("shared-result");
    await page.locator(`a.t-btn-primary[href="/challenges/${KEY}"]`).click();
    await page.waitForURL(`**/challenges/${KEY}`);

    // A direct challenge link keeps its address and shows the challenge.
    await page.goto(`${origin}/challenges/${KEY}`);
    const title = page.locator(".practice-challenge h1");
    await title.waitFor();
    assert.equal(new URL(page.url()).pathname, `/challenges/${KEY}`);
    assert.equal(await title.textContent(), live.title);
    const notice = page.getByText("Open on a computer to solve.");
    const editor = page.locator(".practice-editor .cm-content");
    await editor.waitFor({ state: "attached" });
    assert.equal(
      await notice.isVisible(),
      device.phone,
      `${device.name} notice`,
    );
    assert.equal(
      await editor.isVisible(),
      !device.phone,
      `${device.name} editor`,
    );
    await noOverflow(page, `${device.name} practice`);
    await shot("challenge");

    if (device.phone) {
      const copy = page
        .locator(".practice-desktop-first")
        .getByRole("button", { name: "Copy challenge link" });
      const box = await copy.boundingBox();
      assert.ok(
        box && box.height >= 44,
        `${device.name} copy target ${box?.height}`,
      );
      // Solving anyway shows the editor; it keeps the code across a rotation and Back.
      await page.getByRole("button", { name: "Solve here anyway" }).click();
      await editor.waitFor();
      await page.waitForFunction(() =>
        document.activeElement?.closest(".cm-content"),
      );
      await page.keyboard.type("// synthetic-eng386");
      await page.waitForFunction(() =>
        /Saved/i.test(
          document.querySelector(".practice-controls")?.textContent ?? "",
        ),
      );
      await page.setViewportSize({
        width: device.height,
        height: device.width,
      });
      assert.match((await editor.textContent()) ?? "", /synthetic-eng386/);
      await page.setViewportSize({
        width: device.width,
        height: device.height,
      });
      await page.goto(`${origin}/challenges`);
      await page.goBack();
      await editor.waitFor();
      await page.waitForFunction(() =>
        /synthetic-eng386/.test(
          document.querySelector(".practice-editor .cm-content")?.textContent ??
            "",
        ),
      );
      assert.equal(
        await notice.isVisible(),
        false,
        "solve-here kept for the tab",
      );
      await shot("solving-anyway");
    } else {
      await notice.waitFor({ state: "hidden" });
    }

    // The status bar: links inline where they fit, otherwise a menu.
    const menuButton = page.getByRole("button", { name: "menu" });
    const site = page.getByRole("navigation", { name: "Site" });
    const challengesLink = page.locator(`#t-site-menu a[href="/challenges"]`);
    assert.equal(
      await menuButton.isVisible(),
      narrowBar,
      `${device.name} menu button`,
    );
    if (narrowBar) {
      assert.equal(await site.isVisible(), false);
      if (device.touch) {
        const bar = await page.locator(".t-footer").boundingBox();
        assert.ok(bar && bar.height >= 44, `${device.name} bar ${bar?.height}`);
      }
      await menuButton.click();
      await site.waitFor();
      for (const link of await site.getByRole("link").all()) {
        const box = await link.boundingBox();
        assert.ok(box && box.height >= 44, `${device.name} menu target`);
        assert.ok(
          box.x >= 0 && box.x + box.width <= device.width,
          `${device.name} menu clipped`,
        );
      }
      assert.equal(await challengesLink.getAttribute("aria-current"), "true");
      await shot("menu-open");
      await page.keyboard.press("Escape");
      await site.waitFor({ state: "hidden" });
      await menuButton.click();
      await site.waitFor();
      await page.mouse.click(5, 5);
      await site.waitFor({ state: "hidden" });
      // Keyboard: the menu follows its button in the tab order.
      await menuButton.focus();
      await page.keyboard.press("Enter");
      await site.waitFor();
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement?.textContent),
        "challenges",
      );
      await page.keyboard.press("Enter");
      await page.waitForURL("**/challenges");
      await site.waitFor({ state: "hidden" });
    } else {
      assert.equal(await site.isVisible(), true);
      await challengesLink.click();
      await page.waitForURL("**/challenges");
    }

    // Browsing, previews and descriptions.
    await page.locator(".picker-title").first().waitFor();
    assert.equal(await challengesLink.getAttribute("aria-current"), "page");
    await noOverflow(page, `${device.name} /challenges`);
    await shot("challenges");

    // Stats and the reading pages.
    for (const path of ["/stats", "/", "/manifesto"]) {
      await page.goto(`${origin}${path}`);
      await page.locator("main, .term").first().waitFor();
      await page.waitForLoadState("networkidle");
      await noOverflow(page, `${device.name} ${path}`);
      if (path === "/stats") await shot("stats");
    }
    assert.deepEqual(errors, [], `${device.name} page errors`);
    results.push({ device: device.name, ok: true });
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ engine, results, blocked, output }, null, 2));
