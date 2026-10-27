/**
 * Headless practice for model runs from a work machine: a local server for the page bundle
 * (./page.ts) and the pinned runtimes in apps/web/public, one headless Chromium, and one page
 * per run. The page keeps the run's records; they come back here when practice closes.
 */
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import type { StoredRecord } from "../../packages/domain/records";
import type {
  Edited,
  Opened,
  OpenConfig,
  Practice,
  Ran,
  Range,
} from "../../packages/model-runs/practice";

const root = resolve(import.meta.dirname, "../..");

const TYPES: Record<string, string> = {
  ".wasm": "application/wasm",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
};

/** The server and browser every run's page shares. */
export class PracticeHost {
  private constructor(
    private readonly server: Server,
    private readonly browser: Browser,
    readonly origin: string,
  ) {}

  static async start(): Promise<PracticeHost> {
    const bundle = (
      await build({
        entryPoints: [join(root, "tools/model-runs/page.ts")],
        bundle: true,
        format: "iife",
        write: false,
        target: "es2022",
        define: { "process.env.NODE_ENV": '"production"' },
        logLevel: "error",
      })
    ).outputFiles[0].text;
    const page = `<!doctype html><meta charset="utf-8"><title>practice</title><body><script src="/page.js"></script>`;
    const server = createServer(async (request, response) => {
      const path = new URL(request.url ?? "/", "http://x").pathname;
      if (path === "/") return response.writeHead(200, { "content-type": "text/html" }).end(page);
      if (path === "/page.js")
        return response.writeHead(200, { "content-type": "text/javascript" }).end(bundle);
      if (path.includes("..")) return response.writeHead(400).end();
      try {
        const bytes = await readFile(join(root, "apps/web/public", path));
        const type = TYPES[path.slice(path.lastIndexOf("."))] ?? "application/octet-stream";
        response.writeHead(200, { "content-type": type }).end(bytes);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const browser = await chromium.launch();
    return new PracticeHost(server, browser, origin);
  }

  /** Opens practice on one challenge for one run. */
  async open(config: OpenConfig): Promise<HeadlessPractice> {
    const context = await this.browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(120_000);
    const practice = new HeadlessPractice(page);
    page.on("pageerror", (error) => practice.pageErrors.push(error.message));
    await page.goto(this.origin + "/");
    // As JSON: a revision is too deep for Playwright's argument types.
    practice.opened = await page.evaluate(
      (json) => window.harness.open(JSON.parse(json)),
      JSON.stringify(config),
    );
    return practice;
  }

  async stop(): Promise<void> {
    await this.browser.close();
    await new Promise((done) => this.server.close(done));
  }
}

/** One run's practice page. */
export class HeadlessPractice implements Practice {
  /** Every record stored, in write order: filled when practice closes. */
  records: StoredRecord[] = [];
  readonly pageErrors: string[] = [];
  opened!: Opened;

  constructor(private readonly page: Page) {}

  code(): Promise<string> {
    return this.page.evaluate(() => window.harness.code());
  }

  edit(old: string, replacement: string): Promise<Edited> {
    return this.page.evaluate(([o, r]) => window.harness.edit(o, r), [old, replacement] as const);
  }

  write(text: string): Promise<Edited> {
    return this.page.evaluate((t) => window.harness.write(t), text);
  }

  run(purpose: "examples" | "submit"): Promise<Ran> {
    return this.page.evaluate((p) => window.harness.run(p), purpose);
  }

  /** Records that the run ended, takes the run's records, and closes the page. */
  async close(): Promise<Range> {
    const range = await this.page.evaluate(() => window.harness.close());
    this.records = await this.page.evaluate(() => [...window.harness.records()]);
    await this.page.context().close();
    return range;
  }
}
