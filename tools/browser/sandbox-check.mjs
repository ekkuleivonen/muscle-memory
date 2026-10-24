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

const hits = { app: [], outside: [], outsideCookies: [], assets: [] };
// Synthetic stand-in for an HttpOnly Cloudflare Access cookie. Never a real token.
const AUTH_COOKIE = "CF_Authorization";
const AUTH_VALUE = "synthetic-signed-in";
const page = `<!doctype html><meta charset="utf-8"><body><div id="host"></div>
<script src="/runner.js"></script>
<script>
  document.cookie = "app_secret=cookie-value; path=/";
  localStorage.setItem("app_secret", "local-value");
  indexedDB.open("app-secret-db").onsuccess = () => (window.dbReady = true);
  window.makeRunner = (options) =>
    new MMRunner.Runner(MMRunner.ENGINES.pyodide, document.getElementById("host"), options);
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
  if (path === "/catalog.json")
    return response
      .writeHead(200, { "content-type": "application/json" })
      .end(await readFile(join(root, "content/catalog.json")));
  if (path === "/runner.js")
    return response
      .writeHead(200, { "content-type": "text/javascript" })
      .end(bundle);
  if (path.startsWith("/runtime/") || path.startsWith("/tampered/")) {
    // Like the Access-protected preview: runtime files need the site's sign-in cookie,
    // otherwise the request is redirected to a sign-in page on another origin.
    const signedIn = (request.headers.cookie ?? "").includes(
      `${AUTH_COOKIE}=${AUTH_VALUE}`,
    );
    hits.assets.push({ path, signedIn });
    if (!signedIn)
      return response
        .writeHead(302, { location: `${OUT}/cdn-cgi/access/login` })
        .end();
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
  if (request.headers.cookie) hits.outsideCookies.push(request.headers.cookie);
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

function resetHits() {
  for (const list of Object.values(hits)) list.length = 0;
}

async function signedInContext(browser, value = AUTH_VALUE) {
  const context = await browser.newContext();
  await context.addCookies([
    { name: AUTH_COOKIE, value, url: APP, httpOnly: true, sameSite: "Lax" },
  ]);
  return context;
}

async function check(browserType) {
  resetHits();
  const browser = await browserType.launch();
  const context = process.env.PREVIEW_URL
    ? await browser.newContext()
    : await signedInContext(browser);
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
      window.makeRunner = (options) =>
        new MMRunner.Runner(MMRunner.ENGINES.pyodide, host, options);
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
        entrypoint: "frequency_map",
        filename: "solution.py",
        language: "python",
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
        entrypoint: "frequency_map",
        filename: "solution.py",
        language: "python",
      });
      results.flood = await runner.run(
        request(
          "r10",
          "print('x' * 1000000)\ndef frequency_map(items):\n    return {}\n",
          [],
        ),
      );
      // The runner keeps one spare sandbox ready; disposing it must leave none.
      runner.dispose();
      results.frames = document.querySelectorAll("iframe").length;
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

/**
 * Runtime files behind the site's sign-in: the page must send its own same-origin cookie,
 * fail closed (without following the sign-in redirect) when it is missing or expired, and
 * never send it anywhere else. The sandbox itself still makes no requests.
 */
async function authCheck(browserType) {
  const browser = await browserType.launch();
  const attempt = async (cookie, options = {}) => {
    resetHits();
    const context = cookie
      ? await signedInContext(browser, cookie)
      : await browser.newContext();
    const tab = await context.newPage();
    await tab.goto(APP + "/");
    const outcome = await tab.evaluate(
      async ({ SOLUTION, options }) => {
        let runner;
        try {
          runner = window.makeRunner({ timeoutMs: 4000, ...options });
        } catch (error) {
          return { status: "constructor-error", message: error.message };
        }
        const result = await runner.run({
          runId: "auth",
          code: SOLUTION,
          inputs: [["a", "b", "a"]],
          entrypoint: "frequency_map",
          filename: "solution.py",
          language: "python",
        });
        runner.dispose();
        return result;
      },
      { SOLUTION, options },
    );
    await new Promise((done) => setTimeout(done, 500));
    await context.close();
    return { outcome, hits: structuredClone(hits) };
  };
  const signedIn = await attempt(AUTH_VALUE);
  const signedOut = await attempt(null);
  const expired = await attempt("expired-session");
  const foreign = await attempt(AUTH_VALUE, {
    assetBase: OUT + "/runtime/pyodide-314.0.7/",
  });
  const tampered = await attempt(AUTH_VALUE, {
    assetBase: "/tampered/pyodide-314.0.7/",
  });
  await browser.close();
  const failedClosed = ({ outcome, hits }) =>
    outcome.status === "runner-error" &&
    outcome.phase === "bootstrap" &&
    hits.outside.length === 0;
  return {
    "signed in: runtime files are requested with the site cookie":
      signedIn.hits.assets.length === 4 &&
      signedIn.hits.assets.every((asset) => asset.signedIn),
    "signed in: bootstrap and a synthetic run succeed":
      signedIn.outcome.status === "completed" &&
      signedIn.outcome.cases[0]?.output?.text === '{"a": 2, "b": 1}',
    "signed in: the cookie never reaches another origin":
      signedIn.hits.outsideCookies.length === 0 &&
      signedIn.hits.outside.length === 0,
    "signed out: fails closed without following the sign-in redirect":
      failedClosed(signedOut),
    "expired sign-in: fails closed without following the redirect":
      failedClosed(expired),
    "expired sign-in: the error suggests reloading to sign in":
      /reload the page/.test(expired.outcome.message ?? ""),
    "asset base on another origin is refused before any request":
      foreign.outcome.status === "constructor-error" &&
      foreign.hits.outside.length === 0 &&
      foreign.hits.assets.length === 0,
    "tampered runtime file fails closed even when signed in":
      failedClosed(tampered),
  };
}

function verdicts({ report, frameProbe, hits }) {
  const solved = (outcome) =>
    outcome.status === "completed" &&
    outcome.cases.every((result) => result.output);
  const escapes = report.escapes.stdout?.text ?? "";
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

/**
 * The JavaScript/TypeScript and SQL engines in the same sandbox: correct results through the
 * shared protocol, errors located in the solution file, and no way out to the network.
 */
async function enginesCheck(browserType) {
  resetHits();
  const browser = await browserType.launch();
  const context = await signedInContext(browser, AUTH_VALUE);
  const tab = await context.newPage();
  await tab.goto(APP + "/");
  const report = await tab.evaluate(async (OUT) => {
    const host = document.getElementById("host");
    const run = async (engine, request, timeoutMs = 4000) => {
      const runner = new MMRunner.Runner(MMRunner.ENGINES[engine], host, {
        timeoutMs,
      });
      try {
        return await runner.run({ runId: "e", ...request });
      } finally {
        runner.dispose();
      }
    };
    const ts = (code, inputs, extra = {}) =>
      run("javascript", {
        code,
        inputs,
        filename: "src/apply-discount.ts",
        language: "typescript",
        entrypoint: "applyDiscount",
        parameters: ["totalCents", "code", "codes"],
        ...extra,
      });
    const results = {};
    results.ts = await ts(
      `export type Codes = Record<string, number>;
export function applyDiscount(total: number, code: string, codes: Codes): number {
  const percent = codes[code.trim().toUpperCase()];
  return percent === undefined ? total : Math.floor(total * (100 - percent) / 100);
}`,
      [
        [10000, " save10 ", { SAVE10: 10 }],
        [5000, "NOPE", {}],
      ],
    );
    results.single = await run("javascript", {
      code: "export const formatPrice = (cents) => (cents / 100).toFixed(2);",
      inputs: [123, [1, 2]],
      filename: "src/format-price.js",
      language: "javascript",
      entrypoint: "formatPrice",
    });
    // Several source files: the entry imports siblings, TypeScript and JavaScript alike.
    const totals = (code, files) =>
      run("javascript", {
        code,
        files,
        inputs: [[10000, 10], [5000, 0]],
        filename: "src/cart/totals.ts",
        language: "typescript",
        entrypoint: "cartTotal",
        parameters: ["subtotal", "percent"],
      });
    results.multi = await totals(
      `import { discount } from "./discounts";
import { round } from "../lib/money.js";
export function cartTotal(subtotal: number, percent: number): number {
  return round(subtotal - discount(subtotal, percent));
}`,
      {
        "src/cart/discounts.ts":
          "export const discount = (total: number, percent: number) => total * percent / 100;",
        "src/lib/money.js": "export const round = (n) => Math.floor(n);",
      },
    );
    results.multiThrown = await totals(
      `import { discount } from "./discounts";
export const cartTotal = (s: number, p: number) => discount(s, p);`,
      {
        "src/cart/discounts.ts":
          "export function discount(total: number, percent: number): number {\n  throw new Error('rates unavailable');\n}",
      },
    );
    results.missingModule = await totals(
      `import { gone } from "./nowhere";
export const cartTotal = () => gone;`,
      {},
    );
    results.circular = await totals(
      `import { b } from "./b";
export const cartTotal = () => b;`,
      { "src/cart/b.ts": `import { cartTotal } from "./totals";
export const b = () => cartTotal;` },
    );
    results.syntax = await ts("export function applyDiscount( {", [
      [1, "a", {}],
    ]);
    results.thrown = await ts(
      "export function applyDiscount(): number {\n  throw new RangeError('nope');\n}",
      [[1, "a", {}]],
    );
    results.missing = await ts("export const other = 1;", [[1, "a", {}]]);
    results.nonJson = await ts(
      "export function applyDiscount(): number { return NaN; }",
      [[1, "a", {}]],
    );
    results.escapes = await ts(
      `const attempts = {
  fetch: () => fetch("${OUT}/js-fetch"),
  "dynamic-import": () => import("${OUT}/js-import.js"),
  websocket: () => new Promise((ok, fail) => { const s = new WebSocket("${OUT.replace("http", "ws")}/js-ws"); s.onopen = ok; s.onerror = () => fail(new Error("refused")); }),
  xhr: () => { const r = new XMLHttpRequest(); r.open("GET", "${OUT}/js-xhr", false); r.send(); },
  "import-scripts": () => importScripts("${OUT}/js-script.js"),
  eval: () => new Function("return 1")(),
  indexeddb: () => indexedDB.open("x"),
  "parent-document": () => parent.document.title,
};
for (const [name, attempt] of Object.entries(attempts)) {
  try { await attempt(); console.log(name + " => allowed"); }
  catch (error) { console.log(name + " => blocked " + (error && error.name)); }
}
export function applyDiscount() { return 0; }`,
      [[1, "a", {}]],
    );
    results.loop = await ts(
      "export function applyDiscount() { for (;;) {} }",
      [[1, "a", {}]],
      {},
    );
    const sql = (code, extra = {}) =>
      run(
        "pglite",
        {
          code,
          inputs: [
            {
              orders: [
                [1, "ana", 30],
                [2, "bo", 10],
                [3, "ana", 5.5],
              ],
            },
          ],
          filename: "queries/top-customers.sql",
          language: "sql",
          entrypoint: "query",
          setup:
            "CREATE TABLE orders (id integer PRIMARY KEY, customer text NOT NULL, total numeric NOT NULL);",
          ...extra,
        },
        15000,
      );
    results.sql = await sql(
      "-- revenue\nSELECT customer, sum(total) AS revenue\nFROM orders\nGROUP BY customer\nORDER BY revenue DESC;",
    );
    results.sqlTwice = await sql("SELECT count(*) FROM orders;", {
      inputs: [{ orders: [[1, "a", 1]] }, { orders: [] }],
    });
    results.sqlSyntax = await sql(
      "SELECT customer\nFROM orders\nGROUP BYE customer;",
    );
    results.sqlError = await sql("SELECT 1 / (total - total) FROM orders;");
    results.sqlFixture = await sql("SELECT 1;", { inputs: [{ nope: [[1]] }] });
    results.html = await run("html", {
      code: `<form><label for="a">In <b>stock</b></label><input type="checkbox" id="a" name="x">
<label>On sale <input type="checkbox" name="y"></label><input type="checkbox" aria-label="Clearance">
<input type="checkbox" name="bare"><img src="${OUT}/html-img"><script src="${OUT}/html-script.js"></script></form>`,
      inputs: [
        ["input[type=checkbox]", "label"],
        ["input", "name"],
        ["label", "count"],
        ["label", "text"],
      ],
      filename: "templates/form.html",
      language: "html",
      entrypoint: "page",
      parameters: ["selector", "read"],
    });
    const php = (code, extra = {}) =>
      run(
        "php",
        {
          code,
          inputs: [
            [1000, 1059, 60],
            [1000, 4601, 60],
          ],
          filename: "src/isExpired.php",
          language: "php",
          entrypoint: "isExpired",
          parameters: ["issuedAt", "now", "ttlMinutes"],
          ...extra,
        },
        15000,
      );
    results.php = await php(
      "<?php\nfunction isExpired(int $issuedAt, int $now, int $ttlMinutes): bool {\n  echo 'checked ';\n  return $now - $issuedAt > $ttlMinutes * 60;\n}\n",
    );
    results.phpSyntax = await php("<?php\nfunction isExpired( {\n");
    results.phpThrown = await php(
      "<?php\nfunction isExpired($a, $b, $c) {\n  throw new InvalidArgumentException('nope');\n}\n",
    );
    results.phpFatal = await php("<?php\nundefined_thing();\n");
    results.phpEscape = await php(
      // Emscripten emulates sockets over WebSocket, which the sandbox's CSP refuses: fsockopen
      // hands back a socket that never connects, and no request reaches either server.
      `<?php\nfunction isExpired($a, $b, $c) {\n  $s = @fsockopen('127.0.0.1', ${new URL(OUT).port}, $errno, $errstr, 1);\n  if ($s) { @fwrite($s, "GET /php-socket HTTP/1.0\\r\\n\\r\\n"); @fread($s, 10); }\n  return [@file_get_contents("${OUT}/php-fetch") === false, function_exists('curl_init')];\n}\n`,
      { inputs: [[1, 2, 3]] },
    );
    const ruby = (code, extra = {}) =>
      run(
        "ruby",
        {
          code,
          inputs: [
            [[3, 1, 2], "#{x}"],
            [[], "é"],
          ],
          filename: "lib/sorted.rb",
          language: "ruby",
          entrypoint: "sorted",
          parameters: ["values", "label"],
          ...extra,
        },
        15000,
      );
    results.ruby = await ruby(
      'def sorted(values, label)\n  puts "sorting #{values.size}"\n  { "label" => label, "values" => values.sort, "ratio" => 0.5, "none" => nil }\nend\n',
    );
    results.rubySyntax = await ruby(
      "def sorted(values, label)\n  values.sort(\n",
    );
    results.rubyRaised = await ruby(
      'def sorted(values, label)\n  raise ArgumentError, "nope"\nend\n',
    );
    results.rubyNonJson = await ruby(
      "def sorted(values, label) = Float::NAN\n",
    );
    const go = (code, extra = {}) =>
      run(
        "go",
        {
          code,
          inputs: [
            [[15, 20, 35, 40, 50], 30],
            [[], 99],
          ],
          filename: "percentile.go",
          language: "go",
          entrypoint: "Percentile",
          parameters: ["samples", "p"],
          ...extra,
        },
        15000,
      );
    results.go = await go(
      'package metrics\n\nimport (\n\t"fmt"\n\t"sort"\n)\n\nfunc Percentile(samples []int, p float64) (int, bool) {\n\tfmt.Println("n =", len(samples))\n\tif len(samples) == 0 {\n\t\treturn 0, false\n\t}\n\ts := append([]int(nil), samples...)\n\tsort.Ints(s)\n\treturn s[1], true\n}\n',
    );
    results.goSyntax = await go("package metrics\n\nfunc Percentile( {\n");
    results.goPanic = await go(
      "package metrics\n\nfunc Percentile(samples []int, p float64) (int, bool) {\n\treturn samples[10], true\n}\n",
    );
    results.goEscape = await go(
      `package metrics\n\nimport "net/http"\n\nfunc Percentile(samples []int, p float64) (int, bool) {\n\t_, err := http.Get("${OUT}/go-fetch")\n\tif err != nil {\n\t\treturn 1, true\n\t}\n\treturn 2, true\n}\n`,
      { inputs: [[[1], 1]] },
    );
    results.frames = document.querySelectorAll("iframe").length;
    return results;
  }, OUT);
  await new Promise((done) => setTimeout(done, 500));
  await browser.close();
  const out = (outcome, i = 0) => outcome.cases?.[i]?.output?.text;
  const escapes = report.escapes.stdout?.text ?? "";
  if (process.env.VERBOSE)
    for (const [name, value] of Object.entries(report))
      console.log(name, JSON.stringify(value).slice(0, 700));
  return {
    "typescript: types stripped, parameters spread":
      out(report.ts) === "9000" && out(report.ts, 1) === "5000",
    "javascript: an array input is one argument without parameters":
      out(report.single) === '"1.23"' && out(report.single, 1) === '"NaN"',
    "multi-file: the entry imports sibling TypeScript and JavaScript files":
      out(report.multi) === "9000" && out(report.multi, 1) === "5000",
    "multi-file: an error in an imported file points at that file":
      report.multiThrown.cases[0]?.error?.message === "rates unavailable" &&
      /src\/cart\/discounts\.ts:2:/.test(
        report.multiThrown.cases[0].error.traceback.text,
      ),
    "multi-file: a missing module is a compile error that names it":
      report.missingModule.phase === "compile" &&
      /Cannot find module '\.\/nowhere' imported from src\/cart\/totals\.ts/.test(
        report.missingModule.error.message,
      ),
    "multi-file: a circular import is refused with its path":
      report.circular.phase === "compile" &&
      /Circular import: src\/cart\/totals\.ts → src\/cart\/b\.ts → src\/cart\/totals\.ts/.test(
        report.circular.error.message,
      ),
    "typescript: syntax error is a compile error":
      report.syntax.status === "user-error" &&
      report.syntax.phase === "compile" &&
      /src\/apply-discount\.ts:1:/.test(report.syntax.error.traceback.text),
    "javascript: a thrown error stays with its case and points at the file":
      report.thrown.cases[0]?.error?.type === "RangeError" &&
      /src\/apply-discount\.ts:2:/.test(
        report.thrown.cases[0].error.traceback.text,
      ),
    "javascript: a missing export is explained":
      report.missing.error?.message ===
      "Export a function named applyDiscount.",
    "javascript: values JSON cannot hold are refused, not guessed":
      Boolean(report.nonJson.cases[0]?.unserializable) &&
      !report.nonJson.cases[0]?.output,
    "javascript: network, storage, eval and parent all blocked": [
      "fetch",
      "dynamic-import",
      "websocket",
      "xhr",
      "import-scripts",
      "eval",
      "indexeddb",
      "parent-document",
    ].every((name) => new RegExp(`${name} => blocked`).test(escapes)),
    "javascript: infinite loop times out": report.loop.status === "timeout",
    "sql: rows come back in order, numeric as numbers":
      out(report.sql) === '[["ana",35.5],["bo",10]]',
    "sql: every case starts from empty tables":
      out(report.sqlTwice) === "[[1]]" && out(report.sqlTwice, 1) === "[[0]]",
    "sql: syntax error points at the line, like psql":
      report.sqlSyntax.phase === "compile" &&
      /LINE 3: GROUP BYE customer/.test(report.sqlSyntax.error.traceback.text),
    "sql: runtime error stays with its case": /division by zero/.test(
      report.sqlError.cases[0]?.error?.message ?? "",
    ),
    "sql: broken fixtures are a runner error, not the person's":
      report.sqlFixture.status === "runner-error",
    "html: labels, attributes, counts and text read like a DOM test":
      out(report.html) === '["In stock","On sale","Clearance",null]' &&
      out(report.html, 1) === '["x","y",null,"bare"]' &&
      out(report.html, 2) === "2" &&
      out(report.html, 3) === '["In stock","On sale"]',
    "php: spread arguments, echo captured as output":
      out(report.php) === "false" &&
      out(report.php, 1) === "true" &&
      report.php.stdout.text === "checked checked ",
    "php: parse error is a compile error in the solution file":
      report.phpSyntax.phase === "compile" &&
      /src\/isExpired\.php:2/.test(report.phpSyntax.error.traceback.text),
    "php: an exception stays with its case":
      report.phpThrown.cases[0]?.error?.type === "InvalidArgumentException",
    "php: a fatal error is the person's error, explained":
      report.phpFatal.status === "user-error" &&
      /undefined_thing/.test(report.phpFatal.error.traceback.text),
    "php: no network from file_get_contents or curl (sockets: see the request check)":
      out(report.phpEscape) === "[true,false]",
    "ruby: spread arguments, no interpolation of inputs, puts captured":
      out(report.ruby) ===
        '{"label":"#{x}","values":[1,2,3],"ratio":0.5,"none":null}' &&
      out(report.ruby, 1) ===
        '{"label":"é","values":[],"ratio":0.5,"none":null}' &&
      report.ruby.stdout.text === "sorting 3\nsorting 0\n",
    "ruby: syntax error is a compile error in the solution file":
      report.rubySyntax.phase === "compile" &&
      /lib\/sorted\.rb/.test(report.rubySyntax.error.traceback.text),
    "ruby: an exception stays with its case":
      report.rubyRaised.cases[0]?.error?.type === "ArgumentError" &&
      /lib\/sorted\.rb:2/.test(report.rubyRaised.cases[0].error.traceback.text),
    "ruby: values JSON cannot hold are refused": Boolean(
      report.rubyNonJson.cases[0]?.unserializable,
    ),
    "go: typed arguments, comma-ok as null, fmt output captured":
      out(report.go) === "20" &&
      out(report.go, 1) === "null" &&
      report.go.stdout.text === "n = 5\nn = 0\n",
    "go: syntax error is a compile error in the solution file":
      report.goSyntax.phase === "compile" &&
      /percentile\.go:3/.test(report.goSyntax.error.traceback.text),
    "go: a panic stays with its case and says where":
      report.goPanic.cases[0]?.error?.type === "panic" &&
      /percentile\.go:4/.test(report.goPanic.cases[0].error.traceback.text),
    "go: net/http cannot reach the network": out(report.goEscape) === "1",
    "no request from any engine reached either server":
      hits.app.length === 0 && hits.outside.length === 0,
    "no sandbox frames left behind": report.frames === 0,
  };
}

/**
 * Whether this machine's browser survives a WebAssembly memory trap. Normally it is a
 * catchable RuntimeError; on some hosts (seen on a Debian cloud kernel) the renderer dies
 * instead, which no page can handle. The crash check is skipped there, and says so.
 */
async function survivesMemoryTraps(browserType) {
  // (module (memory 1) (func (export "f") (result i32) i32.const 0x7ffffff0 i32.load))
  const bytes = [
    0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 127, 3, 2, 1, 0, 5, 3, 1, 0,
    1, 7, 5, 1, 1, 102, 0, 0, 10, 13, 1, 11, 0, 65, 240, 255, 255, 255, 7, 40,
    2, 0, 11,
  ];
  const browser = await browserType.launch();
  const page = await browser.newPage();
  const result = await page
    .evaluate(async (bytes) => {
      const { instance } = await WebAssembly.instantiate(new Uint8Array(bytes));
      try {
        instance.exports.f();
        return false;
      } catch (error) {
        return error instanceof WebAssembly.RuntimeError;
      }
    }, bytes)
    .catch(() => false);
  await browser.close();
  return result;
}

/** C and C++ in a page of their own: LLVM alone is 75 MB of WebAssembly. */
async function clangCheck(browserType) {
  const traps = await survivesMemoryTraps(browserType);
  if (!traps)
    console.log(
      "SKIP c: a crash stays with its case (this machine's browser dies on any WebAssembly memory trap)",
    );
  resetHits();
  const browser = await browserType.launch();
  const context = await signedInContext(browser, AUTH_VALUE);
  const tab = await context.newPage();
  if (process.env.VERBOSE)
    tab.on("console", (m) => console.log("page:", m.text().slice(0, 160)));
  tab.on("crash", () => console.log("C/C++ page crashed"));
  await tab.goto(APP + "/");
  const report = await tab.evaluate(async (traps) => {
    const host = document.getElementById("host");
    const results = {};
    const catalog = await (await fetch("/catalog.json")).json();
    // An issue's live revision, flattened to what the engines take.
    const issue = (id) => {
      const meta = catalog.issues.find((i) => i.id === id);
      const { workspace, checks } = catalog.revisions[meta.revision];
      return {
        ...workspace,
        inputs: checks.cases.map((c) => c.input),
        expected: checks.cases.map((c) => c.expected),
        starter: Object.values(workspace.files).find((f) => f.role === "edit").text,
      };
    };
    const ring = issue("ring-buffer");
    const lru = issue("lru-cache");
    // One runner for C, kept between runs like the IDE does.
    const clang = new MMRunner.Runner(MMRunner.ENGINES.clang, host, {
      timeoutMs: 4000,
    });
    const c = (code, extra = {}) =>
      clang.run({
        runId: "c" + Math.random(),
        code,
        inputs: ring.inputs,
        filename: "src/ring_buffer.c",
        language: "c",
        entrypoint: ring.entrypoint,
        parameters: ring.parameters,
        adapter: ring.adapter,
        ...extra,
      });
    const started = performance.now();
    results.c = await c(`#include <stdio.h>
#include <stddef.h>
size_t ring_buffer(size_t capacity, const int *values, size_t count, int *out) {
    size_t start = count > capacity ? count - capacity : 0;
    printf("keeping %zu\\n", count - start);
    for (size_t i = start; i < count; i++) out[i - start] = values[i];
    return count - start;
}
`);
    results.cFirstMs = Math.round(performance.now() - started);
    const again = performance.now();
    results.cAgain = await c(ring.starter);
    results.cAgainMs = Math.round(performance.now() - again);
    results.cSyntax = await c("size_t ring_buffer( {\n");
    if (traps)
      results.cCrash = await c(`#include <stddef.h>
size_t ring_buffer(size_t capacity, const int *values, size_t count, int *out) {
    int *nowhere = (int *)0x7fffffff;
    out[0] = *nowhere;
    return 1;
}
`);
    clang.dispose();
    const cpp = new MMRunner.Runner(MMRunner.ENGINES.clang, host, {
      timeoutMs: 4000,
    });
    results.cpp = await cpp.run({
      runId: "cpp",
      code: `#include <list>
#include <string>
#include <unordered_map>
#include <vector>
struct Op { std::string name; int key; int value; };
std::vector<int> simulate(int capacity, const std::vector<Op>& ops) {
    std::list<std::pair<int, int>> order;
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> where;
    std::vector<int> results;
    for (const Op& op : ops) {
        auto found = where.find(op.key);
        if (op.name == "get") {
            if (found == where.end()) { results.push_back(-1); continue; }
            order.splice(order.begin(), order, found->second);
            results.push_back(found->second->second);
        } else {
            if (found != where.end()) order.erase(found->second);
            order.emplace_front(op.key, op.value);
            where[op.key] = order.begin();
            if ((int)order.size() > capacity) { where.erase(order.back().first); order.pop_back(); }
        }
    }
    return results;
}
`,
      inputs: lru.inputs,
      filename: "src/simulate.cpp",
      language: "cpp",
      entrypoint: lru.entrypoint,
      parameters: lru.parameters,
      adapter: lru.adapter,
    });
    results.cppExpected = lru.expected;
    cpp.dispose();
    results.ringExpected = ring.expected;
    results.frames = document.querySelectorAll("iframe").length;
    return results;
  }, traps);
  await new Promise((done) => setTimeout(done, 500));
  await browser.close();
  if (process.env.VERBOSE)
    for (const [name, value] of Object.entries(report))
      console.log(name, JSON.stringify(value).slice(0, 700));
  return {
    "c: compiles, runs every case, printf captured": (() => {
      const expected = report.ringExpected.map((e) => JSON.stringify(e));
      return (
        report.c.status === "completed" &&
        report.c.cases.every((r, i) => r.output?.text === expected[i]) &&
        /keeping 3\n/.test(report.c.stdout.text)
      );
    })(),
    "c: the sandbox is kept, so a second run skips loading LLVM":
      report.cAgain.status === "completed" && report.cAgainMs < report.cFirstMs,
    "c: a compile error shows clang's message for the solution file":
      report.cSyntax.phase === "compile" &&
      /src\/ring_buffer\.c:1:/.test(report.cSyntax.error.traceback.text),
    ...(traps
      ? {
          "c: a crash stays with its case": report.cCrash.cases.every(
            (r) => r.error?.type === "Crash",
          ),
        }
      : {}),
    "cpp: libc++ containers, the adapter's struct, every case": (() => {
      const expected = report.cppExpected.map((e) => JSON.stringify(e));
      return (
        report.cpp.status === "completed" &&
        report.cpp.cases.every((r, i) => r.output?.text === expected[i])
      );
    })(),
    "no request from C or C++ reached either server":
      hits.app.length === 0 && hits.outside.length === 0,
    "no sandbox frames left behind": report.frames === 0,
  };
}

/** C# in a page of its own: the .NET runtime and Roslyn are 22 MB of WebAssembly. */
async function csharpCheck(browserType) {
  resetHits();
  const browser = await browserType.launch();
  const context = await signedInContext(browser, AUTH_VALUE);
  const tab = await context.newPage();
  await tab.goto(APP + "/");
  const report = await tab.evaluate(async (OUT) => {
    const catalog = await (await fetch("/catalog.json")).json();
    // An issue's live revision, flattened to what the engines take.
    const issue = (id) => {
      const meta = catalog.issues.find((i) => i.id === id);
      const { workspace, checks } = catalog.revisions[meta.revision];
      return {
        ...workspace,
        inputs: checks.cases.map((c) => c.input),
        expected: checks.cases.map((c) => c.expected),
        starter: Object.values(workspace.files).find((f) => f.role === "edit").text,
      };
    };
    const fee = issue("late-fee-rounding");
    const host = document.getElementById("host");
    const run = async (code, extra = {}) => {
      const runner = new MMRunner.Runner(MMRunner.ENGINES.csharp, host, {
        timeoutMs: 4000,
      });
      try {
        return await runner.run({
          runId: "cs",
          code,
          inputs: fee.inputs,
          filename: "src/LateFees.cs",
          language: "csharp",
          entrypoint: fee.entrypoint,
          parameters: fee.parameters,
          ...extra,
        });
      } finally {
        runner.dispose();
      }
    };
    const results = { expected: fee.expected };
    results.starter = await run(fee.starter);
    results.fixed = await run(
      fee.starter
        .replace(
          "Math.Round(Math.Min(fee, balance * 0.10m), 2)",
          "Math.Round(Math.Min(fee, balance * 0.10m), 2, MidpointRounding.AwayFromZero)",
        )
        .replace(
          "if (daysLate <= 0) return 0;",
          'if (daysLate <= 0) return 0;\n        Console.WriteLine($"{balance} for {daysLate} days");',
        ),
    );
    results.syntax = await run(
      "public static class LateFees { public static decimal LateFee(decimal b, int d) { return b }",
    );
    results.thrown = await run(
      'public static class LateFees { public static decimal LateFee(decimal b, int d) => throw new InvalidOperationException("nope"); }',
    );
    results.escape = await run(
      `public static class LateFees { public static decimal LateFee(decimal b, int d) { try { new System.Net.Http.HttpClient().GetStringAsync("${OUT}/cs-fetch").Wait(); return 1; } catch { return 2; } } }`,
      { inputs: [[1, 1]] },
    );
    results.frames = document.querySelectorAll("iframe").length;
    return results;
  }, OUT);
  await new Promise((done) => setTimeout(done, 500));
  await browser.close();
  if (process.env.VERBOSE)
    for (const [name, value] of Object.entries(report))
      console.log(name, JSON.stringify(value).slice(0, 700));
  const outputs = (outcome) => outcome.cases?.map((c) => c.output?.text);
  const expected = report.expected.map((e) => JSON.stringify(e));
  return {
    "csharp: the starter's banker's rounding fails just the midpoint cases":
      report.starter.status === "completed" &&
      outputs(report.starter).filter(
        (o, i) => Number(o) !== JSON.parse(expected[i]),
      ).length === 2,
    "csharp: the fix passes every case, Console output captured":
      outputs(report.fixed).every(
        (o, i) => Number(o) === JSON.parse(expected[i]),
      ) && /100 for 1 days\n/.test(report.fixed.stdout.text),
    "csharp: a compile error shows Roslyn's message for the solution file":
      report.syntax.phase === "compile" &&
      /src\/LateFees\.cs\(1,\d+\): error CS1002/.test(
        report.syntax.error.traceback.text,
      ),
    "csharp: an exception stays with its case":
      report.thrown.cases[0]?.error?.type === "InvalidOperationException",
    // Networking assemblies are not among the references, so it does not even compile.
    "csharp: HttpClient is not available to solutions":
      report.escape.phase === "compile" &&
      /HttpClient/.test(report.escape.error.traceback.text),
    "no request from C# reached either server":
      hits.app.length === 0 && hits.outside.length === 0,
    "no sandbox frames left behind": report.frames === 0,
  };
}

/** Java in a page of its own, like the other compilers. */
async function javaCheck(browserType) {
  resetHits();
  const browser = await browserType.launch();
  const context = await signedInContext(browser, AUTH_VALUE);
  const tab = await context.newPage();
  await tab.goto(APP + "/");
  const report = await tab.evaluate(async (OUT) => {
    const catalog = await (await fetch("/catalog.json")).json();
    // An issue's live revision, flattened to what the engines take.
    const find = (id) => {
      const meta = catalog.issues.find((i) => i.id === id);
      const { workspace, checks } = catalog.revisions[meta.revision];
      return {
        ...workspace,
        inputs: checks.cases.map((c) => c.input),
        expected: checks.cases.map((c) => c.expected),
        starter: Object.values(workspace.files).find((f) => f.role === "edit").text,
      };
    };
    const issue = find("password-policy");
    const host = document.getElementById("host");
    const run = async (code, extra = {}) => {
      const runner = new MMRunner.Runner(MMRunner.ENGINES.java, host, {
        timeoutMs: 4000,
      });
      try {
        return await runner.run({
          runId: "java",
          code,
          inputs: issue.inputs,
          filename: "src/main/java/com/acme/accounts/PasswordPolicy.java",
          language: "java",
          entrypoint: issue.entrypoint,
          adapter: issue.adapter,
          ...extra,
        });
      } finally {
        runner.dispose();
      }
    };
    const results = { expected: issue.expected };
    results.starter = await run(issue.starter);
    results.fixed = await run(
      issue.starter.replace(
        'if (password.length() < 8) broken.add("too-short");',
        'System.out.println("checking " + password.length());\n        if (password.length() < 12) broken.add("too-short");\n        if (!password.matches(".*\\\\d.*")) broken.add("no-digit");\n        if (!password.matches(".*[A-Za-z].*")) broken.add("no-letter");\n        if (password.matches(".*\\\\s.*")) broken.add("has-whitespace");',
      ),
    );
    results.syntax = await run(
      issue.starter.replace("return broken;", "return broken"),
    );
    results.thrown = await run(
      issue.starter.replace(
        "return broken;",
        'throw new IllegalStateException("nope");',
      ),
    );
    // TeaVM's inline JavaScript (@JSBody) is not Java; solutions that use it are refused.
    results.jsbody = await run(
      issue.starter.replace(
        "return broken;",
        `broken.add("net-" + probe());
        return broken;
    }

    @org.teavm.jso.JSBody(script = "var r = new XMLHttpRequest(); r.open('GET', '${OUT}/java-xhr', false); try { r.send(); return 1; } catch (e) { return 2; }")
    static native int probe();

    static void unused() {`,
      ),
      { inputs: ["x"] },
    );
    results.frames = document.querySelectorAll("iframe").length;
    return results;
  }, OUT);
  await new Promise((done) => setTimeout(done, 500));
  await browser.close();
  if (process.env.VERBOSE)
    for (const [name, value] of Object.entries(report))
      console.log(name, JSON.stringify(value).slice(0, 700));
  const outputs = (outcome) => outcome.cases?.map((c) => c.output?.text);
  const expected = report.expected.map((e) => JSON.stringify(e));
  return {
    "java: the starter's 8-character rule fails the cases it should":
      report.starter.status === "completed" &&
      outputs(report.starter)[2] === expected[2] &&
      outputs(report.starter)[0] !== expected[0],
    "java: the fix passes every case, System.out captured":
      outputs(report.fixed).every((o, i) => o === expected[i]) &&
      /checking 21\n/.test(report.fixed.stdout.text),
    "java: a compile error shows javac's message for the solution file":
      report.syntax.phase === "compile" &&
      /PasswordPolicy\.java:\d+: error: ';' expected/.test(
        report.syntax.error.traceback.text,
      ),
    "java: an exception stays with its case":
      report.thrown.cases[0]?.error?.type === "IllegalStateException",
    "java: TeaVM's JavaScript interop is refused as a compile error":
      report.jsbody.phase === "compile" &&
      /TeaVM's JavaScript interop/.test(report.jsbody.error.traceback.text),
    "no request from Java reached either server":
      hits.app.length === 0 && hits.outside.length === 0,
    "no sandbox frames left behind": report.frames === 0,
  };
}

const requested = process.argv.slice(2);
const engines = { chromium, firefox, webkit };
let failures = 0;
// ONLY_AUTH=1 runs just the sign-in section.
for (const name of process.env.ONLY_AUTH
  ? []
  : requested.length
    ? requested
    : ["chromium"]) {
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
if (!process.env.PREVIEW_URL && !process.env.ONLY_AUTH)
  for (const name of requested.length ? requested : ["chromium"]) {
    console.log(`\n=== ${name}: Java ===`);
    for (const [label, pass] of Object.entries(
      await javaCheck(engines[name]),
    )) {
      if (!pass) failures++;
      console.log(`${pass ? "ok  " : "FAIL"} ${label}`);
    }
    console.log(`\n=== ${name}: C# ===`);
    for (const [label, pass] of Object.entries(
      await csharpCheck(engines[name]),
    )) {
      if (!pass) failures++;
      console.log(`${pass ? "ok  " : "FAIL"} ${label}`);
    }
    console.log(`\n=== ${name}: C and C++ ===`);
    for (const [label, pass] of Object.entries(
      await clangCheck(engines[name]),
    )) {
      if (!pass) failures++;
      console.log(`${pass ? "ok  " : "FAIL"} ${label}`);
    }
  }
if (!process.env.PREVIEW_URL && !process.env.ONLY_AUTH)
  for (const name of requested.length ? requested : ["chromium"]) {
    console.log(
      `\n=== ${name}: JavaScript, TypeScript, SQL, HTML, PHP, Ruby and Go ===`,
    );
    for (const [label, pass] of Object.entries(
      await enginesCheck(engines[name]),
    )) {
      if (!pass) failures++;
      console.log(`${pass ? "ok  " : "FAIL"} ${label}`);
    }
  }
if (!process.env.PREVIEW_URL)
  for (const name of requested.length ? requested : ["chromium"]) {
    console.log(`\n=== ${name}: runtime files behind sign-in ===`);
    for (const [label, pass] of Object.entries(
      await authCheck(engines[name]),
    )) {
      if (!pass) failures++;
      console.log(`${pass ? "ok  " : "FAIL"} ${label}`);
    }
  }
if (failures) process.exitCode = 1;
app.close();
outside.close();
