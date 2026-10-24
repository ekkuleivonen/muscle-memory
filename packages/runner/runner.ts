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

export interface RunRequest {
  readonly runId: string;
  readonly code: string;
  /** The solution's file name, used in error locations. */
  readonly filename: string;
  readonly language: string;
  readonly entrypoint: string;
  /** When set, each input is the list of arguments; otherwise it is the only argument. */
  readonly parameters?: readonly string[];
  /** SQL: statements that create the schema before each case. */
  readonly setup?: string;
  /** Fixture inputs only; expected outputs never enter the sandbox. */
  readonly inputs: readonly unknown[];
}

const TEXT_LIMIT = 65536;
const BOOT_TIMEOUT_MS = 60_000;

interface Sandbox {
  readonly frame: HTMLIFrameElement;
  readonly ready: Promise<void>;
  onMessage?: (data: unknown) => void;
  /** The worker failed after it was ready, for example by crashing mid-run. */
  onFailure?: (message: string) => void;
  destroy(): void;
}

export class Runner {
  private assets?: Promise<Record<string, ArrayBuffer>>;
  private spare?: Sandbox;
  private active?: { sandbox: Sandbox; finish: (outcome: RunOutcome) => void };

  private readonly assetBase: URL;

  constructor(
    readonly engine: Engine,
    private readonly host: HTMLElement,
    private readonly options: { timeoutMs: number; assetBase?: string },
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
        sandbox.destroy();
        this.prepare();
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
            () =>
              finish({ status: "timeout", timeoutMs: this.options.timeoutMs }),
            this.options.timeoutMs,
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
  }

  private loadAssets(): Promise<Record<string, ArrayBuffer>> {
    // Only this trusted page fetches runtime files, and only from its own origin, so the
    // site's existing sign-in (such as a Cloudflare Access cookie) applies. The sandbox
    // receives bytes, never credentials. Each file must match its pinned hash, and any
    // redirect (for example to a sign-in page) fails instead of being followed.
    this.assets ??= Promise.all(
      Object.entries(this.engine.files).map(async ([name, integrity]) => {
        let response: Response;
        try {
          response = await fetch(new URL(name, this.assetBase), {
            integrity,
            credentials: "same-origin",
            mode: "same-origin",
            redirect: "error",
          });
        } catch {
          throw new Error(
            `Runtime file ${name} could not be loaded from this site, or did not match its pinned hash. If your sign-in has expired, reload the page.`,
          );
        }
        if (!response.ok)
          throw new Error(
            `Runtime file ${name} is unavailable (${response.status}).`,
          );
        return [name, await response.arrayBuffer()] as const;
      }),
    ).then(Object.fromEntries);
    this.assets.catch(() => (this.assets = undefined));
    return this.assets;
  }

  private createSandbox(): Sandbox {
    const frame = document.createElement("iframe");
    frame.sandbox.add("allow-scripts");
    frame.referrerPolicy = "no-referrer";
    frame.hidden = true;
    frame.title = `${this.engine.label} sandbox`;
    let listener: ((event: MessageEvent) => void) | undefined;
    let destroyed = false;
    const sandbox: Sandbox = {
      frame,
      ready: Promise.resolve(),
      destroy() {
        destroyed = true;
        if (listener) removeEventListener("message", listener);
        frame.remove();
      },
    };
    let isReady = false;
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${this.engine.label} did not start in time.`)),
        BOOT_TIMEOUT_MS,
      );
      listener = (event: MessageEvent) => {
        // Only this frame's opaque origin, never other windows.
        if (event.source !== frame.contentWindow || event.origin !== "null")
          return;
        const data = event.data as { type?: unknown; message?: unknown };
        if (data?.type === "frame-ready") {
          this.loadAssets().then(
            (assets) =>
              frame.contentWindow?.postMessage(
                {
                  type: "init",
                  workerSource: this.engine.worker,
                  assets,
                  config: this.engine.config,
                },
                "*",
              ),
            (error: Error) => reject(error),
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
    sandboxDocument().then((html) => {
      if (destroyed) return;
      frame.srcdoc = html;
      this.host.append(frame);
    });
    return sandbox;
  }
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
