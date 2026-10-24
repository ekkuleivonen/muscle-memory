import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { chromium } from "playwright";
const dir = "/home/ekku/Code/.worktrees/scratch-runtimes/cs-out/_framework/";
const names = (await readdir(dir)).filter((n) => !n.endsWith(".gz") && !n.endsWith(".br"));
const worker = `
self.onunhandledrejection = (e) => console.log("UNHANDLED", String(e.reason), e.reason && e.reason.stack);
self.onerror = (e) => console.log("ONERROR", String(e.message || e));
self.onmessage = async (e) => {
  const files = e.data;
  const blob = (name, type) => URL.createObjectURL(new Blob([files[name]], { type }));
  const respond = (name) => new Response(files[name], { headers: { "content-type": name.endsWith(".wasm") ? "application/wasm" : name.endsWith(".json") ? "application/json" : "application/octet-stream" } });
  self.fetch = async (r) => { const n = new URL(String(r), "https://runtime.invalid/").pathname.split("/").pop(); if (!files[n]) { console.log("MISSING", String(r)); throw new TypeError("no " + n); } return respond(n); };
  try {
    const saved = self.onmessage; self.onmessage = null;
    const { dotnet } = await import(blob("dotnet.js", "text/javascript"));
    self.onmessage = saved;
    const t = performance.now();
    console.log("creating");
    const runtime = await dotnet
      .withConfigSrc("https://runtime.invalid/blazor.boot.json")
      .withDiagnosticTracing(false)
      .withResourceLoader((type, name, defaultUri, integrity, behavior) => {

        if (type.startsWith("js-module") || type === "dotnetjs") return blob(name, "text/javascript");
        return Promise.resolve(respond(name));
      })
      .create();
    const FS = runtime.Module.FS;
    console.log("FS", typeof FS, Object.keys(runtime).join(","));
    try { FS.mkdir("/mm"); } catch {}
    await runtime.runMain("Runner", ["warm"]);
    const boot = Math.round(performance.now() - t);
    const run = async (req) => { FS.writeFile("/mm/request.json", JSON.stringify(req)); await runtime.runMain("Runner", []); return FS.readFile("/mm/result.json", { encoding: "utf8" }); };
    const t2 = performance.now();
    const out = await run({ code: "public static class Prices { public static string FormatPrice(int cents) { Console.WriteLine(nameof(cents)); return nameof(Prices) + (cents / 100.0); } }", file: "src/Prices.cs", entrypoint: "FormatPrice", inputs: [123, 5], spread: false });
    const bad = await run({ code: "public static class P { public static int F(int a) { return a / 0 }", file: "src/P.cs", entrypoint: "F", inputs: [1], spread: false });
    const thrown = await run({ code: "public static class P { public static int F(int a) { throw new InvalidOperationException(nameof(a)); } }", file: "src/P.cs", entrypoint: "F", inputs: [1], spread: false });
    const warm = "main x3";
    postMessage(["boot " + boot + " warm " + warm, "run " + Math.round(performance.now() - t2), out, bad, thrown].join("\\n"));
  } catch (error) { postMessage("error " + error + " " + (error && error.stack)); }
};`;
const files = Object.fromEntries(await Promise.all(names.map(async (n) => {
  let data = await readFile(dir + n);
  if (n.endsWith(".js")) data = Buffer.from(data.toString().replaceAll("import.meta.url", JSON.stringify("https://runtime.invalid/" + n)));
  return [n, data];
})));
const server = createServer((req, res) => {
  if (req.url === "/main") return res.end(`<script>
    window.postMessage = (m) => { window.result = m; };
    ${worker}
    fetch("/files").then(r => r.json()).then(async (names) => {
      const files = {};
      for (const n of names) files[n] = await (await fetch("/f/" + n)).arrayBuffer();
      self.onmessage({ data: files });
    });
  </script>`);
  if (req.url === "/") return res.end(`<script>
    const w = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(worker)}], { type: "text/javascript" })));
    w.onmessage = (e) => { window.result = e.data; };
    w.onerror = (e) => { window.result = "worker error " + e.message; };
    fetch("/files").then(r => r.json()).then(async (names) => {
      const files = {};
      for (const n of names) files[n] = await (await fetch("/f/" + n)).arrayBuffer();
      w.postMessage(files);
    });
  </script>`);
  if (req.url === "/files") return res.end(JSON.stringify(Object.keys(files)));
  if (req.url.startsWith("/f/")) return res.end(files[decodeURIComponent(req.url.slice(3))]);
  res.statusCode = 404; res.end();
}).listen(0, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("crash", () => console.log("PAGE CRASHED"));
  page.on("console", (m) => console.log("console:", m.text().slice(0, 300)));
  await page.goto(`http://127.0.0.1:${server.address().port}/${process.env.MAIN ? "main" : ""}`);
  try { await page.waitForFunction(() => window.result, null, { timeout: 60000 }); console.log(await page.evaluate(() => window.result)); } catch (e) { console.log("wait failed", e.message.slice(0, 200)); }
  await browser.close(); server.close();
});
