/** ENG-386 synthetic acceptance: phones read challenges, results and Stats; practice is desktop-first.
 * MOBILE_ORIGIN=http://localhost:3060 MOBILE_BROWSER=chromium|webkit node --import tsx tools/browser/mobile-check.ts
 * Device emulation (viewport, touch, coarse pointer), not a study on real devices. Uploads and
 * every other request off the origin are stopped in the browser and counted, never sent.
 * Needs the managed catalog copy (`npm run catalog:pull`): Stats is checked after a synthetic solve.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit, type Page } from "playwright";
import { LEGAL_VERSION } from "../../apps/web/lib/legal";
import { encodeOutcome } from "../../apps/web/lib/outcome";
import { readChallenge } from "../../packages/content/source";
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

const solution = readChallenge(KEY).private.solution;
type Device = {
  name: string;
  width: number;
  height: number;
  touch: boolean;
  phone: boolean;
};

const DEVICES: Device[] = [
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
  // A narrow desktop window: a mouse, no touch. Not a phone, whatever its width.
  {
    name: "desktop-narrow-390",
    width: 390,
    height: 844,
    touch: false,
    phone: false,
  },
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

/** A fresh synthetic participant: Terms accepted, stealth or not; nothing leaves the browser. */
async function open(device: Device, stealth: boolean) {
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
  await context.addInitScript(
    ([version, stealth]) => {
      if (location.origin === "null") return;
      localStorage.setItem(
        "muscle-memory.profile",
        JSON.stringify({
          version: "2",
          createdAt: new Date().toISOString(),
          accepted: { version, at: new Date().toISOString() },
          stealth,
          profile: {},
        }),
      );
    },
    [LEGAL_VERSION, stealth] as const,
  );
  // The real clipboard, read back; the system share sheet as a recording stand-in that the
  // person dismisses (AbortError, as browsers report it) unless __shareMode says "ok".
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin,
  });
  // No named functions inside: tsx would wrap them in a helper the page doesn't have.
  await context.addInitScript(() => {
    const w = window as unknown as {
      __shares: ShareData[];
      __shareMode: "dismiss" | "ok";
    };
    w.__shares = [];
    w.__shareMode = "dismiss";
    Navigator.prototype.share = function (data?: ShareData) {
      w.__shares.push({ title: data?.title, url: data?.url });
      return w.__shareMode === "ok"
        ? Promise.resolve()
        : Promise.reject(new DOMException("Share canceled", "AbortError"));
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = (name: string) =>
    page.screenshot({
      path: `${output}/${engine}-${device.name}-${name}.png`,
    });
  return { context, page, errors, shot };
}

try {
  for (const device of DEVICES) {
    const { context, page, errors, shot } = await open(device, true);
    const narrowBar = device.width <= 860;

    // A shared result shows its challenge and leads to it.
    await page.goto(`${origin}/r/${card}`);
    await page.getByText(live.title).first().waitFor();
    await noOverflow(page, `${device.name} /r`);
    await shot("shared-result");
    await page.locator(`a.t-btn-primary[href="/challenges/${KEY}"]`).click();
    await page.waitForURL(`**/challenges/${KEY}`);

    // A direct challenge link keeps its address and shows the challenge.
    await page.goto(`${origin}/challenges/${KEY}?from=synthetic-eng386`);
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

    // Copy and share send exactly the challenge's own address, nothing from this visit.
    const canonical = `${origin}/challenges/${KEY}`;
    const where = page.locator(
      device.phone ? ".practice-desktop-first" : ".practice-challenge",
    );
    const copy = where.getByRole("button", { name: "Copy challenge link" });
    await page.evaluate(() => navigator.clipboard.writeText("synthetic-empty"));
    await copy.click();
    await where.getByRole("button", { name: "Link copied" }).waitFor();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      canonical,
      `${device.name} copied link`,
    );

    if (device.phone) {
      const box = await copy.boundingBox();
      assert.ok(
        box && box.height >= 44,
        `${device.name} copy target ${box?.height}`,
      );
      // Dismissing the share sheet leaves the challenge as it was; sharing sends the same link.
      const share = where.getByRole("button", { name: "Share link" });
      await share.click();
      await page.waitForFunction(() => (window as any).__shares.length === 1);
      await page.evaluate(() => ((window as any).__shareMode = "ok"));
      await share.click();
      await page.waitForFunction(() => (window as any).__shares.length === 2);
      assert.deepEqual(await page.evaluate(() => (window as any).__shares), [
        { title: live.title, url: canonical },
        { title: live.title, url: canonical },
      ]);
      assert.equal(
        page.url(),
        `${origin}/challenges/${KEY}?from=synthetic-eng386`,
      );
      assert.equal(await title.textContent(), live.title);
      assert.equal(await notice.isVisible(), true, "notice after share");
      // Reading only: nothing but the bar's room under the challenge, no empty editor tracks.
      const blank = () =>
        page.evaluate(() => {
          const pane = document
            .querySelector(".practice-challenge")!
            .getBoundingClientRect();
          const pad = parseFloat(
            getComputedStyle(document.querySelector(".practice")!)
              .paddingBottom,
          );
          return (
            document.documentElement.scrollHeight -
            (pane.bottom + scrollY) -
            pad
          );
        });
      assert.ok(
        (await blank()) <= 1,
        `${device.name} blank ${await blank()}px`,
      );
      // Rotating while reading keeps the same mounted editor and the note.
      const mounted = await editor.elementHandle();
      await page.setViewportSize({
        width: device.height,
        height: device.width,
      });
      await page.setViewportSize({
        width: device.width,
        height: device.height,
      });
      assert.equal(await mounted!.evaluate((n) => n.isConnected), true);
      assert.equal(await notice.isVisible(), true, "notice after rotation");
      assert.ok((await blank()) <= 1, `${device.name} blank after rotation`);
      // The end of the page: the challenge, then only the bar. (A full-page capture would
      // re-render without touch emulation, so scroll the real viewport instead.)
      await page.evaluate(() =>
        scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "instant",
        }),
      );
      assert.equal(await notice.isVisible(), true);
      await shot("challenge-end");
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      // Solving anyway shows the editor; it keeps the code across a rotation and Back.
      await page.getByRole("button", { name: "Solve here anyway" }).click();
      await editor.waitFor();
      assert.equal(
        await editor.evaluate((n, m) => n === m, mounted),
        true,
        "the editor shown is the one mounted while reading",
      );
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

  // Session storage that throws on read and write still lets a phone solve here.
  for (const device of DEVICES.filter((d) => d.phone)) {
    const { context, page, errors } = await open(device, true);
    // No named functions inside: tsx would wrap them in a helper the page doesn't have.
    await page.addInitScript(() => {
      const getItem = Storage.prototype.getItem;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key: string) {
        if (key === "muscle-memory.solve-here")
          throw new DOMException("Synthetic: storage blocked", "SecurityError");
        return getItem.call(this, key);
      };
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === "muscle-memory.solve-here")
          throw new DOMException(
            "Synthetic: storage full",
            "QuotaExceededError",
          );
        return setItem.call(this, key, value);
      };
    });
    await page.goto(`${origin}/challenges/${KEY}`);
    const notice = page.getByText("Open on a computer to solve.");
    await notice.waitFor();
    await page.getByRole("button", { name: "Solve here anyway" }).click();
    await page.locator(".practice-editor .cm-content").waitFor();
    assert.equal(
      await notice.isVisible(),
      false,
      `${device.name} notice stuck`,
    );
    assert.deepEqual(errors, [], `${device.name} storage errors surfaced`);
    results.push({ device: device.name, solveHereWithStorageThrowing: true });
    await context.close();
  }

  // Stats on phones, beyond stealth: empty, a report, uploads unavailable, storage unreadable.
  for (const device of DEVICES.filter((d) => d.phone)) {
    const { context, page, errors, shot } = await open(device, false);
    let history: "absent" | "down" = "absent";
    // Uploaded history is synthetic: an empty page, or the service failing.
    await context.route("**/api/private-history", async (route) => {
      if (history === "down") return route.fulfill({ status: 503, body: "" });
      const { window } = route.request().postDataJSON();
      return route.fulfill({
        json: {
          attempts: [],
          unavailable: [],
          next: null,
          readAt: new Date().toISOString(),
          window,
          state: "absent",
        },
      });
    });
    const heading = page.locator(".stats h1");
    const status = page.locator(".report-status");
    const stats = async (title: string, name: string) => {
      await page.goto(`${origin}/stats`);
      await heading.filter({ hasText: title }).waitFor();
      await page.waitForLoadState("networkidle");
      await noOverflow(page, `${device.name} /stats ${name}`);
      await shot(`stats-${name}`);
    };

    await stats("Your portrait starts with one challenge.", "empty");

    // A synthetic solve on the phone, so the report has something to say.
    await page.goto(`${origin}/challenges/${KEY}`);
    await page.getByRole("button", { name: "Solve here anyway" }).click();
    const editor = page.locator(".practice-editor .cm-content");
    await editor.fill(solution);
    await page
      .getByRole("button", { name: /^Run examples/ })
      .and(page.locator(":enabled"))
      .click();
    const submit = page.getByRole("button", { name: "Submit", exact: true });
    await submit.and(page.locator(":enabled")).waitFor();
    await submit.click();
    await page.getByRole("link", { name: "Next challenge →" }).waitFor();

    await stats("How you code", "report");
    assert.equal(await status.count(), 0, `${device.name} report status`);
    history = "down";
    await stats("How you code", "history-unavailable");
    await status.filter({ hasText: "couldn't be added right now" }).waitFor();
    assert.deepEqual(errors, [], `${device.name} stats page errors`);
    await context.close();

    // Storage that can't be read says so and changes nothing: practice records (IndexedDB)
    // unreadable leaves a partial report; an unreadable profile, the error page.
    for (const broken of ["records", "profile"] as const) {
      const run = await open(device, false);
      // No named functions inside: tsx would wrap them in a helper the page doesn't have.
      await run.page.addInitScript((broken) => {
        if (broken === "records")
          IDBFactory.prototype.open = () => {
            throw new DOMException(
              "Synthetic: storage blocked",
              "SecurityError",
            );
          };
        else {
          const getItem = Storage.prototype.getItem;
          Storage.prototype.getItem = function (key: string) {
            if (key === "muscle-memory.profile")
              throw new DOMException(
                "Synthetic: storage blocked",
                "SecurityError",
              );
            return getItem.call(this, key);
          };
        }
      }, broken);
      await run.page.goto(`${origin}/stats`);
      await run.page
        .getByText(
          broken === "records"
            ? "Some saved practice couldn't be read."
            : "Your practice couldn't be read on this browser.",
        )
        .waitFor();
      await noOverflow(run.page, `${device.name} /stats ${broken} error`);
      await run.shot(`stats-error-${broken}`);
      await run.context.close();
    }
    results.push({
      device: device.name,
      stats: [
        "stealth",
        "empty",
        "report",
        "history-unavailable",
        "records-unreadable",
        "profile-unreadable",
      ],
    });
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ engine, results, blocked, output }, null, 2));
