/**
 * The languages that run in the browser, and what runs them. Each engine is a worker source
 * plus pinned runtime files (runtime-manifest.json, written by tools/build-runtimes.mjs);
 * all of them run inside the same sandbox. Adding a language means adding an engine here.
 */
import manifest from "./runtime-manifest.json";
import { CLANG_WORKER } from "./workers/clang";
import { CSHARP_WORKER } from "./workers/csharp";
import { GO_WORKER } from "./workers/go";
import { HTML_WORKER } from "./workers/html";
import { JAVA_WORKER } from "./workers/java";
import { JAVASCRIPT_WORKER } from "./workers/javascript";
import { PHP_WORKER } from "./workers/php";
import { PYTHON_WORKER } from "./workers/python";
import { RUBY_WORKER } from "./workers/ruby";
import { SQL_WORKER } from "./workers/sql";

/** Every pinned runtime except the editor's type checker, which runs no code. */
export type EngineId = Exclude<keyof typeof manifest, "typescript">;

export interface Engine {
  readonly id: EngineId;
  /** Shown in the status bar, e.g. "Python 3.14.2". */
  readonly label: string;
  /** What run observations record as the runtime. */
  readonly runtime: { readonly id: string; readonly version: string } & Record<
    string,
    string
  >;
  readonly basePath: string;
  /** File name → SRI hash. */
  readonly files: Readonly<Record<string, string>>;
  /** File name → size in bytes, for download progress. */
  readonly sizes: Readonly<Record<string, number>>;
  /** Passed to the worker with its files. */
  readonly config: Readonly<Record<string, unknown>>;
  readonly worker: string;
  /** A longer run limit, for engines that compile before running. */
  readonly timeoutMs?: number;
  /**
   * The sandbox may serve several runs: only for engines whose user code runs outside the
   * worker's JavaScript realm (as a separate WebAssembly instance with WASI imports only).
   */
  readonly reusable?: boolean;
  /** The runtime builds functions from source text; see SANDBOX_CSP. */
  readonly allowEval?: boolean;
}

const {
  pyodide,
  javascript,
  pglite,
  html,
  php,
  ruby,
  go,
  clang,
  csharp,
  java,
} = manifest;

export const ENGINES: Record<EngineId, Engine> = {
  pyodide: {
    id: "pyodide",
    label: `Python ${pyodide.python}`,
    runtime: {
      id: "pyodide",
      version: pyodide.version,
      python: pyodide.python,
    },
    basePath: pyodide.basePath,
    files: pyodide.files,
    sizes: pyodide.sizes,
    config: { lock: pyodide.lockInfo },
    worker: PYTHON_WORKER,
  },
  javascript: {
    id: "javascript",
    label: "JavaScript (browser)",
    runtime: {
      id: "browser-javascript",
      version: javascript.version,
      transpiler: `sucrase ${javascript.version}`,
    },
    basePath: javascript.basePath,
    files: javascript.files,
    sizes: javascript.sizes,
    config: {},
    worker: JAVASCRIPT_WORKER,
  },
  pglite: {
    id: "pglite",
    label: `Postgres ${pglite.postgres}`,
    runtime: {
      id: "pglite",
      version: pglite.version,
      postgres: pglite.postgres,
    },
    basePath: pglite.basePath,
    files: pglite.files,
    sizes: pglite.sizes,
    config: {},
    worker: SQL_WORKER,
  },
  html: {
    id: "html",
    label: "DOM checks",
    runtime: { id: "linkedom", version: html.version },
    basePath: html.basePath,
    files: html.files,
    sizes: html.sizes,
    config: {},
    worker: HTML_WORKER,
  },
  php: {
    id: "php",
    label: `PHP ${php.php}`,
    runtime: { id: "php-wasm", version: php.version, php: php.php },
    basePath: php.basePath,
    files: php.files,
    sizes: php.sizes,
    config: {},
    worker: PHP_WORKER,
  },
  ruby: {
    id: "ruby",
    label: `Ruby ${ruby.ruby}`,
    runtime: { id: "ruby.wasm", version: ruby.version, ruby: ruby.ruby },
    basePath: ruby.basePath,
    files: ruby.files,
    sizes: ruby.sizes,
    config: {},
    worker: RUBY_WORKER,
  },
  go: {
    id: "go",
    label: `Go ${go.go} (Yaegi)`,
    runtime: { id: "yaegi", version: go.version, go: go.go },
    basePath: go.basePath,
    files: go.files,
    sizes: go.sizes,
    config: {},
    worker: GO_WORKER,
  },
  clang: {
    id: "clang",
    label: `Clang ${clang.clang}`,
    runtime: { id: "yowasp-clang", version: clang.version, clang: clang.clang },
    basePath: clang.basePath,
    files: clang.files,
    sizes: clang.sizes,
    config: {},
    worker: CLANG_WORKER,
    timeoutMs: 30_000,
    reusable: true,
  },
  csharp: {
    id: "csharp",
    label: `C# ${csharp.csharp} (.NET ${csharp.dotnet})`,
    runtime: {
      id: "dotnet-roslyn",
      version: csharp.version,
      dotnet: csharp.dotnet,
    },
    basePath: csharp.basePath,
    files: csharp.files,
    sizes: csharp.sizes,
    config: {},
    worker: CSHARP_WORKER,
    // Roslyn compiles first; its first compile in a fresh sandbox takes a second or two.
    timeoutMs: 15_000,
  },
  java: {
    id: "java",
    label: `Java ${java.java} (TeaVM)`,
    runtime: { id: "teavm-javac", version: java.version, java: java.java },
    basePath: java.basePath,
    files: java.files,
    sizes: java.sizes,
    config: {},
    worker: JAVA_WORKER,
    // javac, then TeaVM to WebAssembly: about a second, more on a slow machine. Not
    // reusable: TeaVM's interop classes could reach this worker's globals.
    timeoutMs: 30_000,
    // TeaVM's JavaScript interop (used by the compiler and Java's own class library) builds
    // its glue functions from source text.
    allowEval: true,
  },
};

const BY_LANGUAGE: Record<string, EngineId> = {
  python: "pyodide",
  javascript: "javascript",
  typescript: "javascript",
  sql: "pglite",
  html: "html",
  php: "php",
  ruby: "ruby",
  go: "go",
  c: "clang",
  cpp: "clang",
  csharp: "csharp",
  java: "java",
};

/** The engine that runs a language, if any does yet. */
export function engineFor(language: string | undefined): Engine | undefined {
  const id = language && BY_LANGUAGE[language];
  return id ? ENGINES[id] : undefined;
}

/** Languages with an engine. */
export const RUNNABLE_LANGUAGES = Object.keys(BY_LANGUAGE);
