/**
 * Type hints for TypeScript and JavaScript, the way an editor before AI had them: errors as
 * squiggles and the type under the pointer, from the TypeScript language service. Never
 * completion. The service runs in a worker of its own; it only parses and checks the code,
 * never runs it. Its files are pinned and hash-checked like the runners'.
 */
import manifest from "../../../../packages/runner/runtime-manifest.json";
import { loadPinned } from "../../../../packages/runner/runner";

export interface TypeDiagnostic {
  from: number;
  to: number;
  severity: "error" | "warning";
  message: string;
}
export interface TypeHover {
  from: number;
  to: number;
  type: string;
  documentation: string;
}

/** Recorded with the session when the checker is on. */
export const TYPE_CHECK_FEATURES = ["type-diagnostics", "hover-types"] as const;

const WORKER = String.raw`
// typescript.js declares a global var ts; this worker keeps its own name for it.
let api = null;
let libs = {};
let file = "/solution.ts";
let text = "";
let version = 0;
let service = null;

// No DOM in the issues' runtime; just what a server-side module has.
const GLOBALS = "declare var console: { log(...data: any[]): void; info(...data: any[]): void; warn(...data: any[]): void; error(...data: any[]): void };\n" +
  "declare function setTimeout(handler: (...args: any[]) => void, ms?: number, ...args: any[]): number;\n" +
  "declare function clearTimeout(id: number | undefined): void;\n";

function snapshot(name) {
  if (name === file) return api.ScriptSnapshot.fromString(text);
  if (name === "/globals.d.ts") return api.ScriptSnapshot.fromString(GLOBALS);
  const lib = libs[name.slice(1)];
  return lib === undefined ? undefined : api.ScriptSnapshot.fromString(lib);
}

function start(path) {
  file = "/" + path;
  const javascript = /\.(m|c)?jsx?$/.test(path);
  const options = {
    target: api.ScriptTarget.ES2022,
    module: api.ModuleKind.ESNext,
    moduleResolution: api.ModuleResolutionKind.Bundler,
    lib: ["lib.es2023.d.ts"],
    strict: true,
    noEmit: true,
    allowJs: javascript,
    checkJs: false,
    types: [],
  };
  service = api.createLanguageService({
    getScriptFileNames: () => [file, "/globals.d.ts"],
    getScriptVersion: (name) => (name === file ? String(version) : "1"),
    getScriptSnapshot: snapshot,
    getCurrentDirectory: () => "/",
    getCompilationSettings: () => options,
    getDefaultLibFileName: () => "/lib.es2023.d.ts",
    fileExists: (name) => snapshot(name) !== undefined,
    readFile: (name) => {
      const s = snapshot(name);
      return s && s.getText(0, s.getLength());
    },
  });
}

function diagnostics() {
  const all = [...service.getSyntacticDiagnostics(file), ...service.getSemanticDiagnostics(file)];
  return all
    .filter((d) => d.start !== undefined)
    .map((d) => ({
      from: d.start,
      to: d.start + (d.length || 0),
      severity: d.category === api.DiagnosticCategory.Error ? "error" : "warning",
      message: api.flattenDiagnosticMessageText(d.messageText, "\n"),
    }));
}

function hover(position) {
  const info = service.getQuickInfoAtPosition(file, position);
  if (!info) return null;
  return {
    from: info.textSpan.start,
    to: info.textSpan.start + info.textSpan.length,
    type: api.displayPartsToString(info.displayParts),
    documentation: api.displayPartsToString(info.documentation),
  };
}

self.onmessage = (event) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      importScripts(URL.createObjectURL(new Blob([message.typescript], { type: "text/javascript" })));
      api = self.ts;
      libs = JSON.parse(message.libs);
      start(message.path);
      postMessage({ id: message.id, result: true });
    } else if (message.type === "check") {
      text = message.text;
      version++;
      postMessage({ id: message.id, result: diagnostics() });
    } else if (message.type === "hover") {
      if (message.text !== text) {
        text = message.text;
        version++;
      }
      postMessage({ id: message.id, result: hover(message.position) });
    }
  } catch (error) {
    postMessage({ id: message.id, error: String(error).slice(0, 500) });
  }
};
`;

/** Whether a language gets the checker. */
export function checksTypes(language: string): boolean {
  return language === "typescript" || language === "javascript";
}

export class TypeChecker {
  private readonly worker: Worker;
  private readonly ready: Promise<unknown>;
  private next = 0;
  private readonly pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();

  constructor(path: string) {
    this.worker = new Worker(
      URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" })),
    );
    this.worker.onmessage = (event: MessageEvent) => {
      const { id, result, error } = event.data as {
        id: number;
        result?: unknown;
        error?: string;
      };
      const request = this.pending.get(id);
      this.pending.delete(id);
      if (error) request?.reject(new Error(error));
      else request?.resolve(result);
    };
    const pinned = manifest.typescript;
    this.ready = loadPinned(
      pinned,
      new URL(pinned.basePath, location.href),
    ).then((files) =>
      this.call({
        type: "init",
        path,
        typescript: new TextDecoder().decode(files["typescript.js"]),
        libs: new TextDecoder().decode(files["libs.json"]),
      }),
    );
    this.ready.catch(() => undefined);
  }

  private call(message: Record<string, unknown>): Promise<unknown> {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...message, id });
    });
  }

  async check(text: string): Promise<TypeDiagnostic[]> {
    await this.ready;
    return (await this.call({ type: "check", text })) as TypeDiagnostic[];
  }

  async hover(text: string, position: number): Promise<TypeHover | null> {
    await this.ready;
    return (await this.call({
      type: "hover",
      text,
      position,
    })) as TypeHover | null;
  }

  dispose(): void {
    this.worker.terminate();
    for (const request of this.pending.values())
      request.reject(new Error("The type checker was closed."));
    this.pending.clear();
  }
}
