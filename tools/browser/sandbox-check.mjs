/**
 * Real-browser isolation check for the Python sandbox. Serves a test page, the bundled
 * runner and the pinned runtime from one local origin, plus a second "outside" origin, and
 * records every request both receive. Synthetic code only; nothing leaves localhost.
 *
 *   node tools/browser/sandbox-check.mjs [chromium|webkit ...]
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium, firefox, webkit } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const runtimeDir = join(root, "apps/web/public");
const bundle = (
  await build({
    entryPoints: [join(root, "packages/runner/runner.ts")],
    bundle: true,
    format: "iife",
    globalName: "MMRunner",
    write: false,
    target: "es2022",
  })
).outputFiles[0].text;

const hits = { app: [], outside: [] };
const page = `<!doctype html><meta charset="utf-8"><body><div id="host"></div>
<script src="/runner.js"></script>
<script>
  document.cookie = "app_secret=cookie-value; path=/";
  localStorage.setItem("app_secret", "local-value");
  indexedDB.open("app-secret-db").onsuccess = () => (window.dbReady = true);
  window.makeRunner = (options) =>
    new MMRunner.PythonRunner(document.getElementById("host"), options);
</script>`;

function listen(server) {
  return new Promise((done) =>
    server.listen(0, "127.0.0.1", () => done(server.address().port)),
  );
}
const app = createServer(async (request, response) => {
  const path = new URL(request.url, "http://x").pathname;
  if (path === "/")
    return response.writeHead(200, { "content-type": "text/html" }).end(page);
  if (path === "/runner.js")
    return response
      .writeHead(200, { "content-type": "text/javascript" })
      .end(bundle);
  if (path.startsWith("/runtime/") || path.startsWith("/tampered/")) {
    try {
      let bytes = await readFile(
        join(runtimeDir, path.replace(/^\/tampered\//, "/runtime/")),
      );
      if (path.startsWith("/tampered/") && path.endsWith(".wasm"))
        ((bytes = Buffer.from(bytes)), (bytes[100] ^= 1));
      const type = path.endsWith(".wasm")
        ? "application/wasm"
        : path.endsWith(".mjs")
          ? "text/javascript"
          : "application/octet-stream";
      return response.writeHead(200, { "content-type": type }).end(bytes);
    } catch {
      return response.writeHead(404).end();
    }
  }
  hits.app.push(`${request.method} ${request.url}`);
  response.writeHead(204).end();
});
const outside = createServer((request, response) => {
  hits.outside.push(`${request.method} ${request.url}`);
  response.writeHead(200, { "access-control-allow-origin": "*" }).end("leak");
});
outside.on("upgrade", (request, socket) => {
  hits.outside.push(`UPGRADE ${request.url}`);
  socket.destroy();
});
const appPort = await listen(app);
const outsidePort = await listen(outside);
const APP = `http://127.0.0.1:${appPort}`;
const OUT = `http://127.0.0.1:${outsidePort}`;

// Return values whose conversion runs failing user code, and an unprintable exception.
const CONVERSION = `class BadRepr:
    def __repr__(self):
        raise ValueError("repr exploded")
class BadStr(Exception):
    def __str__(self):
        raise RuntimeError("str exploded")
class WorseRepr:
    def __repr__(self):
        raise BadStr()
def deep(levels=100000):
    value = []
    for _ in range(levels):
        value = [value]
    return value
def cyclic():
    value = []
    value.append(value)
    return value
def frequency_map(items):
    if items == ["ok"]:
        return {"ok": 1}
    if items == ["broad"]:
        # Breadth that exhausts the inspection budget before the deep branch is seen.
        return [deep(3000), [0] * 1000000]
    if items == ["repr"]:
        return BadRepr()
    if items == ["deep"]:
        return deep()
    if items == ["worse"]:
        return WorseRepr()
    if items == ["cyclic"]:
        return cyclic()
    raise BadStr()
`;
const SOLUTION = `def frequency_map(items):
    counts = {}
    for item in items:
        counts[item] = counts.get(item, 0) + 1
    return counts
`;
const TESTS = [
  { input: ["a", "b", "a"], expected: { a: 2, b: 1 } },
  { input: [], expected: {} },
];
// Every channel we know of, from inside the worker. Requests are issued, then the run stays
// alive for 2 s so an allowed request would certainly reach a server.
const ESCAPES = `import js, time
attempts = {}
def attempt(name, action):
    try:
        attempts[name] = "allowed: " + str(action())
    except BaseException as error:
        attempts[name] = "blocked: " + type(error).__name__ + ": " + str(error)[:120]
attempt("origin", lambda: js.self.origin)
attempt("fetch-app", lambda: js.fetch("${APP}/beacon-fetch"))
attempt("fetch-outside", lambda: js.fetch("${OUT}/fetch"))
attempt("fetch-private", lambda: js.fetch("http://192.168.1.1/"))
def xhr():
    request = js.XMLHttpRequest.new()
    request.open("GET", "${OUT}/xhr", False)
    request.send()
    return request.status
attempt("xhr", xhr)
attempt("websocket", lambda: js.WebSocket.new("ws://127.0.0.1:${outsidePort}/ws"))
attempt("event-source", lambda: js.EventSource.new("${OUT}/sse"))
attempt("import-scripts", lambda: js.importScripts("${OUT}/script.js"))
attempt("dynamic-import", lambda: js.eval("import('${OUT}/module.js')"))
attempt("nested-worker", lambda: js.Worker.new(js.URL.createObjectURL(js.Blob.new(
    ["fetch('${OUT}/nested-worker')"], js.Object.fromEntries([["type", "text/javascript"]])))))
attempt("indexeddb", lambda: js.indexedDB.open("app-secret-db"))
attempt("caches", lambda: js.caches.open("x"))
attempt("document", lambda: js.document)
attempt("parent", lambda: js.parent)
attempt("cookie-store", lambda: js.cookieStore)
end = time.time() + 2
while time.time() < end:
    pass
for name, outcome in attempts.items():
    print(name, "=>", outcome)
`;

async function check(browserType) {
  hits.app.length = hits.outside.length = 0;
  const browser = await browserType.launch();
  const context = await browser.newContext();
  const tab = await context.newPage();
  const violations = [];
  tab.on("console", (message) => {
    if (process.env.DEBUG)
      console.error("console:", message.text().slice(0, 300));
    if (/Content Security Policy|Refused/i.test(message.text()))
      violations.push(message.text().slice(0, 160));
  });
  if (process.env.PREVIEW_URL) {
    // Same checks from the built app's origin, using the assets it serves.
    await tab.goto(process.env.PREVIEW_URL);
    await tab.addScriptTag({ content: bundle });
    await tab.evaluate(() => {
      const host = document.body.appendChild(document.createElement("div"));
      host.id = "host";
      document.cookie = "app_secret=cookie-value; path=/";
      localStorage.setItem("app_secret", "local-value");
      window.makeRunner = (options) => new MMRunner.PythonRunner(host, options);
    });
  } else {
    await tab.goto(APP + "/");
    await tab.waitForFunction(() => window.dbReady);
  }
  const report = await tab.evaluate(
    async ({ SOLUTION, TESTS, ESCAPES, CONVERSION, BAD_ASSETS }) => {
      const runner = window.makeRunner({ timeoutMs: 4000 });
      const time = async (work) => {
        const started = performance.now();
        const outcome = await work();
        return { ms: Math.round(performance.now() - started), outcome };
      };
      const request = (runId, code, tests = TESTS) => ({
        runId,
        code,
        inputs: tests.map((test) => test.input),
        functionName: "frequency_map",
      });
      const results = {};
      runner.prepare();
      results.firstRun = await time(() => runner.run(request("r1", SOLUTION)));
      results.warmRun = await time(() => runner.run(request("r2", SOLUTION)));
      results.syntax = await runner.run(
        request("r3", "def frequency_map(items)\n  return {}"),
      );
      results.runtime = await runner.run(
        request("r4", "def frequency_map(items):\n    return 1 / 0"),
      );
      results.escapes = await runner.run(
        request(
          "r5",
          ESCAPES + "\ndef frequency_map(items):\n    return {}\n",
          [],
        ),
      );
      results.loop = await time(() =>
        runner.run(request("r6", "while True:\n    pass\n")),
      );
      results.afterLoop = await runner.run(request("r7", SOLUTION));
      const cancelled = runner.run(
        request(
          "r8",
          "def frequency_map(items):\n    while True:\n        pass\n",
        ),
      );
      setTimeout(() => runner.cancel(), 300);
      results.cancel = await time(() => cancelled);
      results.afterCancel = await runner.run(request("r9", SOLUTION));
      results.conversion = await runner.run({
        runId: "r11",
        code: CONVERSION,
        inputs: [
          ["ok"],
          ["broad"],
          ["repr"],
          ["deep"],
          ["worse"],
          ["cyclic"],
          ["raise"],
        ],
        functionName: "frequency_map",
      });
      results.flood = await runner.run(
        request(
          "r10",
          "print('x' * 1000000)\ndef frequency_map(items):\n    return {}\n",
          [],
        ),
      );
      results.frames = document.querySelectorAll("iframe").length;
      runner.dispose();
      const tampered = window.makeRunner({
        timeoutMs: 4000,
        assetBase: BAD_ASSETS,
      });
      results.tampered = await tampered.run(request("t1", SOLUTION));
      tampered.dispose();
      results.appStorageIntact = {
        cookie: document.cookie,
        local: localStorage.getItem("app_secret"),
      };
      return results;
    },
    {
      SOLUTION,
      CONVERSION,
      TESTS,
      ESCAPES,
      // The preview cannot serve tampered bytes, so it checks missing files instead.
      BAD_ASSETS: process.env.PREVIEW_URL
        ? "/runtime/missing/"
        : "/tampered/pyodide-314.0.7/",
    },
  );
  // The frame's own document: our boot code's environment, probed directly.
  const probeRunner = await tab.evaluateHandle(() => {
    const runner = window.makeRunner({ timeoutMs: 4000 });
    runner.prepare();
    return runner;
  });
  await tab.waitForFunction(() => document.querySelector("iframe"));
  const frame = tab.frames().find((candidate) => candidate !== tab.mainFrame());
  await frame.waitForLoadState();
  const frameProbe = await frame.evaluate(() => {
    const probe = (action) => {
      try {
        return "allowed: " + String(action());
      } catch (error) {
        return "blocked: " + error.name;
      }
    };
    return {
      origin: self.origin,
      parentDocument: probe(() => parent.document.title),
      parentLocalStorage: probe(() => parent.localStorage.length),
      cookie: probe(() => document.cookie),
      localStorage: probe(() => localStorage.length),
      indexedDB: probe(() => indexedDB.open("app-secret-db") && "opened"),
    };
  });
  await probeRunner.evaluate((runner) => runner.dispose());
  // Positive control: an ordinary same-origin worker does reach the network.
  await tab.evaluate((OUT) => {
    const source = `fetch("${OUT}/control-worker")`;
    new Worker(
      URL.createObjectURL(new Blob([source], { type: "text/javascript" })),
    );
  }, OUT);
  await new Promise((done) => setTimeout(done, 1000));
  await browser.close();
  return {
    report,
    frameProbe,
    hits: structuredClone(hits),
    violations: violations.length,
  };
}

function verdicts({ report, frameProbe, hits }) {
  const solved = (outcome) =>
    outcome.status === "completed" &&
    outcome.cases.every((result) => result.output);
  const escapes = report.escapes.stdout.text;
  const blocked = (name, pattern = "") =>
    new RegExp(`${name} => blocked${pattern}`).test(escapes);
  return {
    "normal run returns raw outputs": solved(report.firstRun.outcome),
    "syntax error is a user error":
      report.syntax.status === "user-error" &&
      report.syntax.phase === "compile",
    "runtime error is recorded per case": report.runtime.cases.every(
      (result) => result.error?.type === "ZeroDivisionError",
    ),
    "no request from the sandbox reached either server":
      hits.app.length === 0 && hits.outside.join() === "GET /control-worker",
    "positive control: an ordinary worker reaches the network":
      hits.outside.includes("GET /control-worker"),
    "worker IndexedDB denied": blocked("indexeddb", ".*SecurityError"),
    "XHR and importScripts blocked":
      blocked("xhr") && blocked("import-scripts"),
    "eval refused by CSP": blocked("dynamic-import", ".*EvalError"),
    "no document, parent, caches or cookieStore in the worker": [
      "document",
      "parent",
      "caches",
      "cookie-store",
    ].every((name) => blocked(name)),
    "sandbox frame is an opaque origin": frameProbe.origin === "null",
    "frame cannot read parent DOM, cookies or storage": Object.entries(
      frameProbe,
    ).every(
      ([key, value]) => key === "origin" || value === "blocked: SecurityError",
    ),
    "app cookie and localStorage intact":
      report.appStorageIntact.local === "local-value" &&
      report.appStorageIntact.cookie.includes("cookie-value"),
    "infinite loop times out": report.loop.outcome.status === "timeout",
    "clean run after timeout": solved(report.afterLoop),
    "cancel stops the run": report.cancel.outcome.status === "cancelled",
    "clean run after cancel": solved(report.afterCancel),
    "conversion failures stay per case and keep earlier cases": (() => {
      const outcome = report.conversion;
      if (outcome.status !== "completed") return false;
      const [ok, broad, badRepr, deep, worse, cyclic, raised] = outcome.cases;
      return (
        ok.output?.text === '{"ok": 1}' &&
        broad.conversionError?.type === "ConversionLimitError" &&
        !broad.repr &&
        !broad.output &&
        badRepr.conversionError?.type === "ValueError" &&
        Boolean(badRepr.unserializable) &&
        deep.conversionError?.type === "RecursionError" &&
        worse.conversionError?.message === "<unprintable BadStr>" &&
        cyclic.conversionError?.type === "RecursionError" &&
        raised.error?.message === "<unprintable BadStr>"
      );
    })(),
    "output flood bounded with byte count":
      report.flood.stdout.truncated && report.flood.stdout.bytes === 1000001,
    "tampered or missing runtime fails closed":
      report.tampered.status === "runner-error" &&
      report.tampered.phase === "bootstrap",
    "no sandbox frames left behind": report.frames === 0,
  };
}

const requested = process.argv.slice(2);
const engines = { chromium, firefox, webkit };
let failures = 0;
for (const name of requested.length ? requested : ["chromium"]) {
  const result = await check(engines[name]);
  console.log(`\n=== ${name} ===`);
  for (const [label, pass] of Object.entries(verdicts(result))) {
    if (!pass) failures++;
    console.log(`${pass ? "ok  " : "FAIL"} ${label}`);
  }
  console.log("timings (ms):", {
    firstRun: result.report.firstRun.ms,
    warmRun: result.report.warmRun.ms,
    timeout: result.report.loop.ms,
    cancel: result.report.cancel.ms,
  });
  if (process.env.VERBOSE) {
    console.log(result.report.escapes.stdout.text);
    console.log(
      JSON.stringify(result.report.conversion, null, 1).slice(0, 3000),
    );
  }
}
if (failures) process.exitCode = 1;
app.close();
outside.close();
