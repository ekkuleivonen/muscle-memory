/** Local test automation of the same admin-browser checks. No production executor. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import type { ValidationPlan } from "../../packages/authoring/contracts";

export async function localOperatorBrowser(root: string) {
  const bundle = (
    await build({
      stdin: {
        contents: `export { runBrowserValidation } from './packages/authoring/browser';`,
        resolveDir: root,
        loader: "ts",
      },
      bundle: true,
      format: "iife",
      globalName: "MMOperator",
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
  const run = async (plan: ValidationPlan) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
      await page.goto(origin);
      const work = page.evaluate(
        (plan) =>
          (window as any).MMOperator.runBrowserValidation(
            plan,
            document.getElementById("sandbox"),
          ),
        plan,
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          work,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    "Local browser test exceeded its bounded deadline.",
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
  };
  return {
    run,
    dispose: async () => {
      await browser.close();
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    },
  };
}
