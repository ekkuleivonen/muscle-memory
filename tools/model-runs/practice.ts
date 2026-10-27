/**
 * Headless practice for model runs: a local server for the page bundle (./page.ts) and the
 * pinned runtimes in apps/web/public, one headless Chromium, and one page per run. Every record
 * the session stores comes back here and is kept in memory, in write order, with the same
 * identical-or-conflict rule as the device's store.
 */
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import type { WriteOutcome } from "../../packages/capture/recorder";
import type { StoredRecord } from "../../packages/domain/records";
import type { Edited, Opened, OpenConfig, Ran, Range } from "./page";

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
    await page.exposeFunction("mmWrite", (records: StoredRecord[]) => practice.store(records));
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
export class HeadlessPractice {
  /** Every record stored, in write order. */
  readonly records: StoredRecord[] = [];
  readonly pageErrors: string[] = [];
  opened!: Opened;
  private readonly byId = new Map<string, string>();

  constructor(private readonly page: Page) {}

  /** The device store's rule: an identical record is a duplicate, a changed one a conflict. */
  store(records: readonly StoredRecord[]): WriteOutcome[] {
    return records.map((record) => {
      const stored = this.byId.get(record.recordId);
      if (stored !== undefined) return stored === record.payload ? "duplicate" : "conflict";
      this.byId.set(record.recordId, record.payload);
      this.records.push(record);
      return "written";
    });
  }

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

  /** Records that the run ended, writes what is buffered, and closes the page. */
  async close(): Promise<Range> {
    const range = await this.page.evaluate(() => window.harness.close());
    await this.page.context().close();
    return range;
  }
}

/** The run's clock: wall-clock-anchored and monotonic, the same formula as the page's. */
export function runClock(): number {
  return performance.timeOrigin + performance.now();
}
