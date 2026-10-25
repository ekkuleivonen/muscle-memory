/**
 * Browser-side controller for a sandboxed language runtime (see engines.ts). Every run gets a
 * fresh sandbox:
 * finished, timed-out and cancelled runs all destroy their iframe (and with it the worker
 * and anything it spawned). A spare sandbox is prepared in the background so reruns start
 * quickly. If the runtime cannot load inside the boundary, runs fail closed as runner errors.
 */
import type { Engine } from "./engines";
import { sandboxDocument } from "./sandbox";

export { ENGINES, engineFor, RUNNABLE_LANGUAGES, type Engine } from "./engines";

export interface Bounded {
  readonly text: string;
  readonly bytes: number;
  readonly truncated: boolean;
}
/** An error raised by the solution, in its language's own words. */
export interface CodeError {
  readonly type: string;
  readonly message: string;
  readonly traceback: Bounded;
}
/** Raw result of calling the entrypoint on one fixture input. Not a verdict. */
export interface CaseResult {
  readonly index: number;
  /** The return value as JSON, when it can be represented as JSON. */
  readonly output?: Bounded;
  readonly repr?: Bounded;
  readonly unserializable?: string;
  /** The call raised. */
  readonly error?: CodeError;
  /** The call returned, but converting its value (repr or JSON) raised. */
  readonly conversionError?: CodeError;
}

export type RunOutcome =
  | {
      readonly status: "completed" | "user-error";
      readonly phase: "compile" | "execute" | "tests";
      readonly error?: CodeError;
      readonly cases: readonly CaseResult[];
      readonly stdout: Bounded;
      readonly stderr: Bounded;
      readonly durationMs: number;
    }
  | { readonly status: "timeout"; readonly timeoutMs: number }
  | { readonly status: "cancelled" }
  | {
      readonly status: "runner-error";
      readonly phase: "bootstrap" | "execution";
      readonly message: string;
    };

/** How far a runtime has got: downloading its files, then starting up. */
export type LoadProgress =
  | {
      readonly phase: "download";
      readonly loaded: number;
      readonly total: number;
    }
  | { readonly phase: "start" };

export interface RunRequest {
  readonly runId: string;
  /** The entry file's source: CI loads it and calls the entry point. */
  readonly code: string;
  /**
   * The program's other source files by path, relative to the repo root, for engines that load
   * more than one file (see `multiFile` in engines.ts). The entry file can import them.
   */
  readonly files?: Readonly<Record<string, string>>;
  /** The entry file's path, used in error locations and to resolve relative imports. */
  readonly filename: string;
  readonly language: string;
  readonly entrypoint: string;
  /** When set, each input is the list of arguments; otherwise it is the only argument. */
  readonly parameters?: readonly string[];
  /** SQL: statements that create the schema before each case. */
  readonly setup?: string;
  /** C and C++: the issue's adapter from JSON arguments to the function's types. */
  readonly adapter?: string;
  /** Fixture inputs only; expected outputs never enter the sandbox. */
  readonly inputs: readonly unknown[];
}

const TEXT_LIMIT = 65536;
/**
 * How long a sandbox may take to start, not counting the download: a slow connection is not a
 * failed runtime. Downloads have a separate, bounded total duration.
 */
const BOOT_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

interface Sandbox {
  readonly frame: HTMLIFrameElement;
  readonly ready: Promise<void>;
  onMessage?: (data: unknown) => void;
  /** The worker failed after it was ready, for example by crashing mid-run. */
  onFailure?: (message: string) => void;
  destroy(): void;
}

export class Runner {
  /** Progress is shown for the first load; later sandboxes load from the HTTP cache. */
  private loadedOnce = false;
  private spare?: Sandbox;
  private active?: { sandbox: Sandbox; finish: (outcome: RunOutcome) => void };
  /** Stops downloads still under way when the runner is disposed, so none outlives it. */
  private readonly downloads = new AbortController();

  private readonly assetBase: URL;

  constructor(
    readonly engine: Engine,
    private readonly host: HTMLElement,
    private readonly options: {
      timeoutMs: number;
      assetBase?: string;
      /** Reported while the first sandbox loads; reruns reuse the files. */
      onProgress?: (progress: LoadProgress) => void;
    },
  ) {
    // Credentials are sent with asset requests, so they may only go to this page's origin.
    this.assetBase = new URL(
      options.assetBase ?? engine.basePath,
      location.href,
    );
    if (this.assetBase.origin !== location.origin)
      throw new Error(
        "Runtime files must be served from this site's own origin.",
      );
  }

  /** How long a run may take: the engine's own limit when it compiles first. */
  get timeoutMs(): number {
    return Math.max(this.options.timeoutMs, this.engine.timeoutMs ?? 0);
  }

  /** Starts loading a sandbox ahead of the first run. Safe to call repeatedly. */
  prepare(): void {
    this.spare ??= this.createSandbox();
  }

  /** Resolves when a sandbox is ready to run; rejects if the runtime cannot start. */
  ready(): Promise<void> {
    this.prepare();
    return (this.spare ?? this.active!.sandbox).ready;
  }

  get running(): boolean {
    return Boolean(this.active);
  }

  /** `onRunning` fires when the code is handed to a ready sandbox; before that it is queued. */
  run(request: RunRequest, onRunning?: () => void): Promise<RunOutcome> {
    if (this.active) throw new Error("A run is already in progress.");
    const sandbox = this.spare ?? this.createSandbox();
    this.spare = undefined;
    return new Promise<RunOutcome>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (outcome: RunOutcome) => {
        if (this.active?.sandbox !== sandbox) return;
        clearTimeout(timer);
        this.active = undefined;
        // An engine whose code never runs in the worker's own realm may keep its sandbox
        // after a clean finish; timeouts, cancels and failures always start over.
        const clean =
          outcome.status === "completed" || outcome.status === "user-error";
        if (this.engine.reusable && clean && !this.spare) {
          sandbox.onMessage = undefined;
          sandbox.onFailure = undefined;
          this.spare = sandbox;
        } else {
          sandbox.destroy();
          this.prepare();
        }
        resolve(outcome);
      };
      this.active = { sandbox, finish };
      sandbox.ready.then(
        () => {
          if (this.active?.sandbox !== sandbox) return;
          sandbox.onMessage = (data) => {
            const outcome = parseResult(data, request.runId);
            if (outcome) finish(outcome);
          };
          sandbox.onFailure = (message) =>
            finish({ status: "runner-error", phase: "execution", message });
          // The timeout covers execution only, not runtime loading.
          timer = setTimeout(
            () => finish({ status: "timeout", timeoutMs: this.timeoutMs }),
            this.timeoutMs,
          );
          sandbox.frame.contentWindow?.postMessage(
            { type: "run", ...request },
            "*",
          );
          onRunning?.();
        },
        (error: Error) =>
          finish({
            status: "runner-error",
            phase: "bootstrap",
            message: error.message,
          }),
      );
    });
  }

  /** Stops the current run by destroying its sandbox. */
  cancel(): void {
    this.active?.finish({ status: "cancelled" });
  }

  dispose(): void {
    this.cancel();
    this.spare?.destroy();
    this.spare = undefined;
    this.downloads.abort();
  }

  /**
   * Fresh bytes for each sandbox, transferred rather than copied: runtimes run to 100 MB, and
   * keeping a copy here while the frame and its worker hold theirs runs a tab out of memory.
   * Each load is hash-checked again; the browser's HTTP cache makes the repeats cheap.
   */
  private async loadAssets(): Promise<Record<string, ArrayBuffer>> {
    const assets = await loadPinned(
      this.engine,
      this.assetBase,
      this.loadedOnce ? undefined : this.options.onProgress,
      { signal: this.downloads.signal },
    );
    this.loadedOnce = true;
    return assets;
  }

  private createSandbox(): Sandbox {
    const frame = document.createElement("iframe");
    frame.sandbox.add("allow-scripts");
    frame.referrerPolicy = "no-referrer";
    frame.hidden = true;
    frame.title = `${this.engine.label} sandbox`;
    let listener: ((event: MessageEvent) => void) | undefined;
    const sandbox: Sandbox = {
      frame,
      ready: Promise.resolve(),
      destroy() {
        if (listener) removeEventListener("message", listener);
        frame.remove();
      },
    };
    let isReady = false;
    const ready = new Promise<void>((resolve, reject) => {
      // Armed for the frame to load, paused while the files download, armed again to start.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(
          () =>
            reject(new Error(`${this.engine.label} did not start in time.`)),
          BOOT_TIMEOUT_MS,
        );
      };
      arm();
      listener = (event: MessageEvent) => {
        // Only this frame's opaque origin, never other windows.
        if (event.source !== frame.contentWindow || event.origin !== "null")
          return;
        const data = event.data as { type?: unknown; message?: unknown };
        if (data?.type === "frame-ready") {
          clearTimeout(timer);
          this.loadAssets().then(
            (assets) => {
              arm();
              this.options.onProgress?.({ phase: "start" });
              frame.contentWindow?.postMessage(
                {
                  type: "init",
                  workerSource: this.engine.worker,
                  assets,
                  config: this.engine.config,
                },
                "*",
                Object.values(assets),
              );
            },
            (error: Error) => {
              clearTimeout(timer);
              reject(error);
            },
          );
        } else if (data?.type === "ready") {
          clearTimeout(timer);
          isReady = true;
          resolve();
        } else if (data?.type === "boot-failed") {
          clearTimeout(timer);
          if (isReady) sandbox.onFailure?.(text(data.message, 500));
          else
            reject(
              new Error(
                `${this.engine.label} failed to start: ${text(data.message, 500)}`,
              ),
            );
        } else sandbox.onMessage?.(data);
      };
      addEventListener("message", listener);
    });
    ready.catch(() => undefined);
    (sandbox as { ready: Promise<void> }).ready = ready;
    frame.srcdoc = sandboxDocument(this.engine.allowEval);
    this.host.append(frame);
    return sandbox;
  }
}

/**
 * Fetches pinned runtime files. Only the trusted page fetches them, and only from its own
 * origin, so the site's existing sign-in (such as a Cloudflare Access cookie) applies; a
 * sandbox receives bytes, never credentials. Each file must match its pinned hash, and any
 * redirect (for example to a sign-in page) fails instead of being followed. Download
 * progress counts verified bytes against pinned sizes. SRI fetch may withhold the response
 * until the whole file is verified, so no stream-stall claim is made. A separate total
 * download timeout bounds hangs; `signal` stops a disposed runner.
 */
export async function loadPinned(
  pinned: {
    readonly files: Readonly<Record<string, string>>;
    readonly sizes: Readonly<Record<string, number>>;
  },
  base: URL,
  onProgress?: (progress: LoadProgress) => void,
  {
    signal,
    downloadTimeoutMs = DOWNLOAD_TIMEOUT_MS,
  }: { signal?: AbortSignal; downloadTimeoutMs?: number } = {},
): Promise<Record<string, ArrayBuffer>> {
  const total = Object.values(pinned.sizes).reduce((a, b) => a + b, 0);
  let loaded = 0;
  const stop = new AbortController();
  const abort = () => stop.abort();
  signal?.addEventListener("abort", abort);
  if (signal?.aborted) stop.abort();
  let timedOut = false;
  const watchdog = setTimeout(() => {
    timedOut = true;
    stop.abort();
  }, downloadTimeoutMs);
  const count = (bytes: number) => {
    loaded += bytes;
    onProgress?.({ phase: "download", loaded: Math.min(loaded, total), total });
  };
  const failure = (name: string, fallback: string) =>
    new Error(
      timedOut
        ? `Runtime download exceeded ${downloadTimeoutMs / 1000} s. Retry when your connection is ready.`
        : signal?.aborted
          ? `Loading runtime file ${name} was stopped.`
          : fallback,
    );
  try {
    const entries = await Promise.all(
      Object.entries(pinned.files).map(async ([name, integrity]) => {
        let response: Response;
        try {
          response = await fetch(new URL(name, base), {
            integrity,
            credentials: "same-origin",
            mode: "same-origin",
            redirect: "error",
            signal: stop.signal,
          });
        } catch {
          throw failure(
            name,
            `Runtime file ${name} could not be loaded from this site, or did not match its pinned hash. If your sign-in has expired, reload the page.`,
          );
        }
        if (!response.ok)
          throw new Error(
            `Runtime file ${name} is unavailable (${response.status}).`,
          );
        let bytes: ArrayBuffer;
        try {
          bytes = await read(response, count);
        } catch {
          throw failure(name, `Runtime file ${name} could not be read.`);
        }
        // Large files ship gzipped (static hosts cap file sizes); the hash covers the
        // compressed bytes, and callers get them unpacked under their plain name.
        if (name.endsWith(".gz"))
          return [name.slice(0, -3), await gunzip(bytes)] as const;
        return [name, bytes] as const;
      }),
    );
    return Object.fromEntries(entries);
  } catch (error) {
    // One failed file stops the others: nothing keeps downloading for a runtime that failed.
    stop.abort();
    throw error;
  } finally {
    clearTimeout(watchdog);
    signal?.removeEventListener("abort", abort);
  }
}

/** Engines whose files this page has already asked the HTTP cache for. */
const warmed = new Set<string>();

/**
 * Fetches an engine's pinned files into the browser's HTTP cache ahead of opening the IDE, at
 * low priority, so the IDE's own load (which checks every hash again) reads them from the cache.
 * Same origin and integrity rules as loadPinned; nothing is kept in memory and nothing runs.
 * Once per engine per page, skipped when the browser asks to save data, and failures are left
 * for the IDE's own load to report.
 */
export function warmRuntime(engine: Engine, assetBase?: string): void {
  if (warmed.has(engine.basePath)) return;
  const connection = (navigator as { connection?: { saveData?: boolean } })
    .connection;
  if (connection?.saveData) return;
  const base = new URL(assetBase ?? engine.basePath, location.href);
  if (base.origin !== location.origin) return;
  warmed.add(engine.basePath);
  for (const [name, integrity] of Object.entries(engine.files))
    void fetch(new URL(name, base), {
      integrity,
      credentials: "same-origin",
      mode: "same-origin",
      redirect: "error",
      priority: "low",
    } as RequestInit)
      .then((response) => response.arrayBuffer())
      .catch(() => warmed.delete(engine.basePath));
}

/** Reads a body while counting bytes; integrity is still checked by fetch at the end. */
async function read(
  response: Response,
  count: (bytes: number) => void,
): Promise<ArrayBuffer> {
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    count(bytes.byteLength);
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    count(value.byteLength);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

function gunzip(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

/** Validates an untrusted message from the sandbox; anything malformed is ignored. */
function parseResult(data: unknown, runId: string): RunOutcome | undefined {
  if (!data || typeof data !== "object") return;
  const message = data as Record<string, unknown>;
  if (message.runId !== runId) return;
  if (message.type === "runner-error")
    return {
      status: "runner-error",
      phase: "execution",
      message: text(message.message, 2000),
    };
  if (message.type !== "result") return;
  const phase = message.phase;
  if (phase !== "compile" && phase !== "execute" && phase !== "tests") return;
  const cases = Array.isArray(message.tests)
    ? message.tests.slice(0, 100).map((value, index): CaseResult => {
        const result = (value ?? {}) as Record<string, unknown>;
        return {
          index,
          ...(result.output ? { output: bounded(result.output) } : {}),
          ...(result.repr ? { repr: bounded(result.repr) } : {}),
          ...(typeof result.unserializable === "string"
            ? { unserializable: result.unserializable.slice(0, 500) }
            : {}),
          ...(result.error ? { error: codeError(result.error) } : {}),
          ...(result.conversionError
            ? { conversionError: codeError(result.conversionError) }
            : {}),
        };
      })
    : [];
  return {
    status: message.error ? "user-error" : "completed",
    phase,
    ...(message.error ? { error: codeError(message.error) } : {}),
    cases,
    stdout: bounded(message.stdout),
    stderr: bounded(message.stderr),
    durationMs: Number.isFinite(message.durationMs)
      ? Number(message.durationMs)
      : 0,
  };
}

function codeError(value: unknown): CodeError {
  const error = (value ?? {}) as Record<string, unknown>;
  return {
    type: text(error.type, 200),
    message: text(error.message, 2000),
    traceback: bounded(error.traceback),
  };
}

function bounded(value: unknown): Bounded {
  const record = (value ?? {}) as Record<string, unknown>;
  const full = typeof record.text === "string" ? record.text : "";
  const kept = full.slice(0, TEXT_LIMIT);
  const bytes = Number.isSafeInteger(record.bytes) ? Number(record.bytes) : 0;
  return {
    text: kept,
    bytes,
    truncated: record.truncated === true || kept.length < full.length,
  };
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}
