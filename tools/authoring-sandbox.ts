/** Trusted operator automation. User code executes only in the existing opaque-origin sandbox. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import type { TrustedValidator } from "../packages/authoring/contracts";
import { runtimePin } from "../packages/authoring/runtime";
export async function localSandboxValidator(root: string) {
  const bundle = (
    await build({
      stdin: {
        contents: `export { Runner,engineFor } from './packages/runner/runner'; export { runtimePin } from './packages/authoring/runtime'; export { RUN_TIMEOUT_MS } from './packages/runner/policy';`,
        resolveDir: root,
        loader: "ts",
      },
      bundle: true,
      format: "iife",
      globalName: "MMTrustedRunner",
      write: false,
      target: "es2022",
    })
  ).outputFiles[0].text;
  const assets = resolve(root, "apps/web/public");
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://local").pathname;
    if (path === "/")
      return res
        .writeHead(200, { "content-type": "text/html" })
        .end(
          '<!doctype html><meta charset="utf-8"><div id="sandbox"></div><script src="/runner.js"></script>',
        );
    if (path === "/runner.js")
      return res
        .writeHead(200, { "content-type": "application/javascript" })
        .end(bundle);
    const file = resolve(assets, "." + path);
    if (!path.startsWith("/runtime/") || !file.startsWith(assets + sep)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const bytes = await readFile(file);
      res
        .writeHead(200, {
          "content-type": path.endsWith(".wasm")
            ? "application/wasm"
            : /\.(m?js)$/.test(path)
              ? "application/javascript"
              : "application/octet-stream",
        })
        .end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No local validator listener.");
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  const validator: TrustedValidator = {
    async run(plan) {
      if (
        (await runtimePin(plan.revision.language)).fingerprint !==
        plan.runtime.fingerprint
      )
        throw new Error("Validator checkout runtime differs from queued job.");
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await page.route("**/*", (route) =>
          new URL(route.request().url()).origin === origin
            ? route.continue()
            : route.abort(),
        );
        await page.goto(origin);
        const work = page.evaluate(async (plan) => {
          const api = (window as any).MMTrustedRunner;
          if (
            (await api.runtimePin(plan.revision.language)).fingerprint !==
            plan.runtime.fingerprint
          )
            throw new Error("Browser runtime differs from queued job.");
          const results = [];
          for (const run of plan.runs) {
            const r = plan.revision,
              runner = new api.Runner(
                api.engineFor(r.language),
                document.getElementById("sandbox"),
                { timeoutMs: api.RUN_TIMEOUT_MS },
              );
            try {
              results.push({
                id: run.id,
                codeDigest: run.codeDigest,
                outcome: await runner.run({
                  runId: run.id,
                  code: run.code,
                  filename: r.file,
                  language: r.language,
                  entrypoint: r.entrypoint,
                  ...(r.parameters ? { parameters: r.parameters } : {}),
                  ...(r.schema ? { setup: r.schema } : {}),
                  ...(r.adapter ? { adapter: r.adapter } : {}),
                  inputs: r.cases.map((c) => c.input),
                }),
              });
            } finally {
              runner.dispose();
            }
          }
          return results;
        }, plan);
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            work,
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error(
                      "Trusted validation job exceeded its bounded deadline.",
                    ),
                  ),
                180000,
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      } finally {
        await context.close();
      }
    },
  };
  return {
    validator,
    dispose: async () => {
      await browser.close();
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    },
  };
}
