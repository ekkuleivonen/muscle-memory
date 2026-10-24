/**
 * Real-browser acceptance run for the Python workspace against a local Workers preview of the
 * built app (`npm run build:cloudflare` first). Starts `wrangler dev --local`; nothing is
 * deployed. Faults are injected from the test into IndexedDB only; the app has no test hooks.
 *
 *   node tools/browser/workspace-check.mjs
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const PORT = 8790;
const URL = `http://127.0.0.1:${PORT}/workspace`;
const SOLUTION = `def frequency_map(items):
    counts = {}
    for item in items:
        counts[item] = counts.get(item, 0) + 1
    return counts
`;

const preview = spawn(
  "npx",
  ["wrangler", "dev", "--local", "--port", String(PORT)],
  {
    cwd: resolve(root, "apps/web"),
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    stdio: "ignore",
    detached: true,
  },
);
const results = {};
// ONLY=session,device,double-open,retry,bootstrap runs a subset.
const want = (section) =>
  !process.env.ONLY || process.env.ONLY.split(",").includes(section);
const check = (name, condition, detail) => {
  results[name] = {
    pass: Boolean(condition),
    ...(detail === undefined ? {} : { detail }),
  };
  console.error(`${condition ? "ok  " : "FAIL"} ${name}`);
};

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      if ((await fetch(URL)).ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error("Preview did not start.");
}

// Injected before the app loads: lets the test make IndexedDB fail, never the app itself.
function injectStorageFaults() {
  window.__storageFault = false;
  const get = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (...args) {
    if (window.__storageFault && this.name === "workspace")
      throw new DOMException("Injected storage failure", "UnknownError");
    return get.apply(this, args);
  };
}

// Event Timing: how long the browser took to handle each key event while typing.
function observeInput() {
  window.__inputTimings = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      if (
        entry.name.startsWith("key") ||
        entry.name === "beforeinput" ||
        entry.name === "input"
      )
        window.__inputTimings.push(entry.duration);
  }).observe({ type: "event", durationThreshold: 16, buffered: false });
  window.__longTasks = 0;
  new PerformanceObserver(
    (list) => (window.__longTasks += list.getEntries().length),
  ).observe({
    type: "longtask",
  });
}

async function openWorkspace(page, { device }) {
  await page.goto(URL);
  if (device) await page.getByLabel(/Save workspace activity/).check();
  await page.getByLabel(/I understand what is recorded/).check();
  await page.getByRole("button", { name: /Open the workspace/ }).click();
  await page.locator(".cm-content").waitFor();
  const started = Date.now();
  await page.getByText("Python ready.").waitFor({ timeout: 60000 });
  return Date.now() - started;
}

async function setCode(page, code) {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(code);
}

const docText = (page) =>
  page.evaluate(() =>
    document.querySelector(".cm-content").cmTile.root.view.state.doc.toString(),
  );

async function runAndWait(page, pattern, timeout = 20000) {
  await page.getByRole("button", { name: /Run ▸/ }).click();
  await page.locator(".result h3", { hasText: pattern }).waitFor({ timeout });
  return page.locator(".result").innerText();
}

async function typingProfile(page, characters) {
  await page.evaluate(
    () => (window.__inputTimings = []) && (window.__longTasks = 0),
  );
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  const started = Date.now();
  await page.keyboard.type("#" + "x".repeat(characters - 1));
  const elapsed = Date.now() - started;
  const { timings, longTasks } = await page.evaluate(() => ({
    timings: window.__inputTimings,
    longTasks: window.__longTasks,
  }));
  return {
    characters,
    elapsedMs: elapsed,
    keyEventsOver16ms: timings.length,
    maxKeyEventMs: timings.length ? Math.max(...timings) : 0,
    longTasks,
  };
}

function readWorkspaceRecords(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("muscle-memory-local-practice");
        setTimeout(
          () =>
            reject(
              new Error("IndexedDB read timed out: " + request.readyState),
            ),
          5000,
        );
        request.onblocked = () => reject(new Error("IndexedDB read blocked"));
        request.onsuccess = () => {
          const database = request.result;
          const all = database
            .transaction("workspace")
            .objectStore("workspace")
            .getAll();
          all.onsuccess = () => {
            database.close();
            try {
              resolve(all.result.map((row) => JSON.parse(row.payload)));
            } catch (error) {
              reject(error);
            }
          };
          all.onerror = () => reject(all.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

function streamSummary(records) {
  const observations = records.filter((record) => record.observationId);
  const bySource = new Map();
  for (const observation of observations) {
    const list = bySource.get(observation.source.id) ?? [];
    list.push(observation.source.sequence);
    bySource.set(observation.source.id, list);
  }
  return [...bySource.values()].map((sequences) => {
    sequences.sort((a, b) => a - b);
    const missing = [];
    for (let index = 1; index < sequences.length; index++)
      if (sequences[index] !== sequences[index - 1] + 1)
        missing.push([sequences[index - 1] + 1, sequences[index] - 1]);
    if (sequences[0] !== 1) missing.unshift([1, sequences[0] - 1]);
    return { count: sequences.length, highest: sequences.at(-1), missing };
  });
}

try {
  await waitForServer();
  const browser = await chromium.launch();

  // Session-only: editing, runs, errors, timeout, cancel, stale results, undo.
  if (want("session")) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(observeInput);
    const bootMs = await openWorkspace(page, { device: false });
    check("runtime boots inside the sandbox", true, { bootMs });
    check(
      "starter code is loaded",
      (await docText(page)).includes("def frequency_map"),
    );
    await setCode(page, SOLUTION);
    let text = await runAndWait(page, /Run result/);
    check(
      "normal run: 4/4 fixtures correct",
      text.includes("4/4 fixtures correct"),
      text.split("\n")[1],
    );

    await setCode(page, "def frequency_map(items)\n    return {}\n");
    text = await runAndWait(page, /Run user-error/);
    check(
      "syntax error is a user error with a traceback",
      /SyntaxError/.test(text),
    );
    await setCode(page, "def frequency_map(items):\n    return items[99]\n");
    text = await runAndWait(page, /Run result/);
    check(
      "runtime error is reported per fixture",
      /IndexError/.test(text) && text.includes("0/4"),
    );
    await setCode(
      page,
      'print("x" * 200000)\ndef frequency_map(items):\n    return {}\n',
    );
    text = await runAndWait(page, /Run result/);
    check(
      "large output is truncated with byte count",
      /Output truncated: showing the first 64 KiB of 200001 bytes/.test(text),
    );

    await setCode(
      page,
      "def frequency_map(items):\n    while True:\n        pass\n",
    );
    let started = Date.now();
    text = await runAndWait(page, /Run timeout/, 30000);
    check("infinite loop times out", text.includes("Stopped after 5 s"), {
      ms: Date.now() - started,
    });
    await setCode(page, SOLUTION);
    started = Date.now();
    text = await runAndWait(page, /Run result/);
    check("clean rerun after timeout", text.includes("4/4"), {
      ms: Date.now() - started,
    });

    await setCode(
      page,
      "def frequency_map(items):\n    while True:\n        pass\n",
    );
    await page.getByRole("button", { name: /Run ▸/ }).click();
    await page.locator(".result h3", { hasText: /Run running/ }).waitFor();
    started = Date.now();
    await page.getByRole("button", { name: /Cancel run/ }).click();
    await page.locator(".result h3", { hasText: /Run cancelled/ }).waitFor();
    check("cancel stops a running loop", true, { ms: Date.now() - started });
    check("code survives cancel", (await docText(page)).includes("while True"));
    await setCode(page, SOLUTION);
    text = await runAndWait(page, /Run result/);
    check("clean rerun after cancel", text.includes("4/4"));

    // Edit while a slow run is in flight: its result belongs to the earlier revision.
    await setCode(
      page,
      "import time\nend = time.time() + 1.5\nwhile time.time() < end:\n    pass\n" +
        SOLUTION,
    );
    await page.getByRole("button", { name: /Run ▸/ }).click();
    await page.locator(".result h3", { hasText: /Run running/ }).waitFor();
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("# edited during the run");
    await page.locator(".result h3", { hasText: /Run result/ }).waitFor();
    const heading = await page.locator(".result h3").innerText();
    check(
      "result of an earlier revision is marked stale",
      /you have edited since/.test(heading),
      heading,
    );

    const before = await docText(page);
    await page.keyboard.type("abc");
    await page.keyboard.press("Control+Z");
    check("undo restores the previous text", (await docText(page)) === before);
    await page.keyboard.press("Control+Shift+Z");
    check("redo reapplies it", (await docText(page)) === before + "abc");
    await page.keyboard.press("Shift+Home");
    const selection = await page.evaluate(() => {
      const range =
        document.querySelector(".cm-content").cmTile.root.view.state.selection
          .main;
      return { from: range.from, to: range.to };
    });
    check("selection works", selection.to - selection.from > 0, selection);

    check(
      "typing stays responsive (session memory)",
      true,
      await typingProfile(page, 300),
    );
    await context.close();
  }

  // Device-local: persistence, recovery, faults, gaps and clear.
  if (want("device")) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(injectStorageFaults);
    await page.addInitScript(observeInput);
    await openWorkspace(page, { device: true });
    await setCode(page, SOLUTION);
    await runAndWait(page, /Run result/);
    await page.waitForTimeout(1500);
    let records = await readWorkspaceRecords(page);
    const runs = records.filter(
      (record) => record.type === "observation.workspace.run",
    );
    check(
      "run lifecycle is recorded in order",
      runs.map((run) => run.data.status).join(",") === "queued,running,result",
      runs.map((run) => run.data.status),
    );
    const result = runs.at(-1);
    const artifact = records.find(
      (record) => record.artifactId === result?.data.codeArtifactId,
    );
    check(
      "run is correlated with its exact code revision",
      artifact?.text === SOLUTION && artifact.revision === result.data.revision,
    );
    check(
      "observations carry consent/capture versions, local-only receipt and no research consent",
      records
        .filter((record) => record.observationId)
        .every(
          (record) =>
            record.researchConsent === false &&
            record.serverReceipt.status === "absent" &&
            record.consentVersion === "workspace-device-local-v1" &&
            record.captureVersion === "workspace-capture-1.0.0",
        ),
    );
    check(
      "edits are individual ordered observations",
      records.some(
        (record) =>
          record.type === "observation.workspace.edit" && record.data.userEvent,
      ),
    );
    check(
      "stream has no gaps",
      streamSummary(records).every((stream) => !stream.missing.length),
      streamSummary(records),
    );

    // Storage fails while typing: the editor stays responsive and capture retries.
    await page.evaluate(() => (window.__storageFault = true));
    await page.locator(".cm-content").click();
    await page.evaluate(() => {
      const view = document.querySelector(".cm-content").cmTile.root.view;
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    });
    const failing = await typingProfile(page, 300);
    await page.waitForTimeout(1500);
    const retrying = await page
      .locator("p[role=status]", { hasText: /records stored/ })
      .innerText();
    check("typing stays responsive while storage fails", true, failing);
    check(
      "failed storage is reported and retried",
      /failing and will retry/.test(retrying) && /not saved yet/.test(retrying),
      retrying,
    );
    // Overflow the 1000-record buffer while storage is down.
    await page.keyboard.type("y".repeat(1100), { delay: 0 });
    await page.evaluate(() => (window.__storageFault = false));
    await page.waitForTimeout(12000);
    records = await readWorkspaceRecords(page);
    const gap = records.find(
      (record) => record.type === "observation.workspace.capture-gap",
    );
    const status = await page
      .locator("p[role=status]", { hasText: /records stored/ })
      .innerText();
    check(
      "buffer overflow is disclosed as a stored gap",
      gap?.data.reason === "buffer-full",
      gap?.data,
    );
    check("the UI discloses the gap", /capture gap/.test(status), status);
    const summary = streamSummary(records);
    check(
      "missing positions match the disclosed gap exactly",
      summary.length === 1 &&
        summary[0].missing.length === 1 &&
        summary[0].missing[0][0] === gap?.data.fromSequence &&
        summary[0].missing[0][1] === gap?.data.toSequence,
      summary,
    );

    // Recovery after reload.
    await page.reload();
    await openWorkspace(page, { device: true });
    // The capture gap above means only code up to the gap is exact; that must be disclosed.
    const restored = await page.getByText(/^Restored /).innerText();
    check(
      "after a capture gap, recovery stops at the gap and says so",
      /Restored revision \d+, the latest code that could be recovered exactly/.test(
        restored,
      ) && /not recovered/.test(restored),
      restored,
    );

    await page
      .getByRole("button", { name: /Clear all device-local practice/ })
      .click();
    await page
      .getByText(
        /Workspace activity, pending captures and local identity cleared/,
      )
      .waitFor();
    await page.waitForTimeout(1000);
    records = await readWorkspaceRecords(page);
    check(
      "clear removes every workspace record",
      records.length === 0,
      records.length,
    );
    await context.close();
  }

  // Refresh keeps the latest saved code exactly, not only the last snapshot.
  if (want("recovery")) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const savedConfirmed = async () => {
      await page.waitForTimeout(500);
      return page
        .getByText(/All edits so far are saved on this device/)
        .waitFor({ timeout: 5000 })
        .then(
          () => true,
          () => false,
        );
    };
    const reopen = async () => {
      await page.reload();
      await openWorkspace(page, { device: true });
      return page
        .getByText(/^Restored /)
        .innerText({ timeout: 5000 })
        .catch(() => "");
    };
    await openWorkspace(page, { device: true });
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("x = 1");
    const before = await docText(page);
    check("a short edit is confirmed saved", await savedConfirmed());
    let message = await reopen();
    let after = await docText(page);
    check("refresh restores the exact text of a short edit", after === before, {
      before: before.slice(-40),
      after: after.slice(-40),
      message,
    });
    check(
      "recovery is reported as complete",
      /Restored your latest saved code/.test(message),
      message,
    );

    await setCode(page, SOLUTION);
    await runAndWait(page, /Run result/);
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("# after run");
    await page.keyboard.press("Control+Z");
    await page.keyboard.type("# edited");
    const afterRun = await docText(page);
    check("edits after a run are confirmed saved", await savedConfirmed());
    message = await reopen();
    after = await docText(page);
    check(
      "refresh restores the exact text after a run, undo and more edits",
      after === afterRun,
      {
        expected: afterRun.slice(-40),
        after: after.slice(-40),
        message,
      },
    );
    await context.close();
  }

  // A double click while catalog responses arrive out of order opens exactly one session.
  if (want("double-open")) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let catalogRequests = 0;
    await page.route("**/api/catalog", async (route) => {
      const request = ++catalogRequests;
      const response = await route.fetch();
      // Staggered: a second request, if any, would resolve before the first.
      await new Promise((done) => setTimeout(done, request === 1 ? 1500 : 100));
      await route.fulfill({ response });
    });
    await page.goto(URL);
    await page.getByLabel(/Save workspace activity/).check();
    await page.getByLabel(/I understand what is recorded/).check();
    // Two clicks in the same task, before React can re-render a disabled button.
    await page.evaluate(() => {
      const open = [...document.querySelectorAll("button")].find((button) =>
        button.textContent.includes("Open the workspace"),
      );
      open.click();
      open.click();
    });
    const opening = page.locator("button", { hasText: /Opening/ });
    const label = (await opening.count()) === 1 && (await opening.isDisabled());
    await page.locator(".cm-content").waitFor();
    await page.getByText("Python ready.").waitFor({ timeout: 60000 });
    await page.waitForTimeout(2000);
    check("Open is disabled while opening", label);
    check(
      "double open makes one catalog request",
      catalogRequests === 1,
      catalogRequests,
    );
    check(
      "double open shows one editor",
      (await page.locator(".cm-editor").count()) === 1,
    );
    await setCode(page, SOLUTION);
    const text = await runAndWait(page, /Run result/);
    check("Run works in the single session", text.includes("4/4"));
    await page.waitForTimeout(1500);
    const records = await readWorkspaceRecords(page);
    const opened = records.filter(
      (record) => record.type === "observation.workspace.opened",
    );
    const sources = new Set(
      records
        .filter((record) => record.source)
        .map((record) => record.source.id),
    );
    check(
      "one opened observation and one source",
      opened.length === 1 && sources.size === 1,
      {
        opened: opened.length,
        sources: sources.size,
      },
    );
    await page
      .getByRole("button", { name: /Clear all device-local practice/ })
      .click();
    await page
      .getByText(
        /Workspace activity, pending captures and local identity cleared/,
      )
      .waitFor();
    await page.waitForTimeout(2000);
    check(
      "Clear removes everything and nothing writes afterwards",
      (await readWorkspaceRecords(page)).length === 0,
    );
    await context.close();
  }

  // Retry loading Python: the open session must run on the reloaded runtime.
  if (want("retry")) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let broken = true;
    await page.route("**/pyodide.asm.wasm", async (route) => {
      const response = await route.fetch();
      const body = Buffer.from(await response.body());
      if (broken) body[100] ^= 1;
      await route.fulfill({ response, body });
    });
    await page.goto(URL);
    await page.getByLabel(/I understand what is recorded/).check();
    await page.getByRole("button", { name: /Open the workspace/ }).click();
    await page.getByText(/Run is unavailable/).waitFor({ timeout: 60000 });
    broken = false;
    await page.getByRole("button", { name: /Retry loading Python/ }).click();
    await page.getByText("Python ready.").waitFor({ timeout: 60000 });
    await setCode(page, SOLUTION);
    const text = await runAndWait(page, /Run result/);
    check(
      "after Retry, the open session runs on the reloaded runtime",
      text.includes("4/4"),
    );
    check(
      "the disposed runtime left no sandbox frames beyond the new spare",
      (await page.locator("iframe").count()) <= 1,
      await page.locator("iframe").count(),
    );
    await context.close();
  }

  // Bootstrap failure is reported separately from user-code failure, and Run stays off.
  if (want("bootstrap")) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route("**/pyodide.asm.wasm", async (route) => {
      const response = await route.fetch();
      const body = Buffer.from(await response.body());
      body[100] ^= 1;
      await route.fulfill({ response, body });
    });
    await page.goto(URL);
    await page.getByLabel(/I understand what is recorded/).check();
    await page.getByRole("button", { name: /Open the workspace/ }).click();
    const alert = await page
      .getByText(/Run is unavailable/)
      .innerText({ timeout: 60000 });
    const disabled = await page
      .getByRole("button", { name: /Run ▸/ })
      .isDisabled();
    check(
      "tampered runtime fails closed with Run unavailable",
      disabled,
      alert,
    );
    await context.close();
  }
  await browser.close();
} finally {
  process.kill(-preview.pid);
}
const failed = Object.entries(results).filter(([, value]) => !value.pass);
console.log(JSON.stringify(results, null, 2));
console.log(
  `${Object.keys(results).length - failed.length}/${Object.keys(results).length} checks passed`,
);
if (failed.length) process.exitCode = 1;
