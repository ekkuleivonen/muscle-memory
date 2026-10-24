/**
 * The languages that run in the browser, and what runs them. Each engine is a worker source
 * plus pinned runtime files (runtime-manifest.json, written by tools/build-runtimes.mjs);
 * all of them run inside the same sandbox. Adding a language means adding an engine here.
 */
import manifest from "./runtime-manifest.json";
import { HTML_WORKER } from "./workers/html";
import { JAVASCRIPT_WORKER } from "./workers/javascript";
import { PHP_WORKER } from "./workers/php";
import { PYTHON_WORKER } from "./workers/python";
import { RUBY_WORKER } from "./workers/ruby";
import { SQL_WORKER } from "./workers/sql";

export type EngineId = keyof typeof manifest;

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
}

const { pyodide, javascript, pglite, html, php, ruby } = manifest;

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
};

const BY_LANGUAGE: Record<string, EngineId> = {
  python: "pyodide",
  javascript: "javascript",
  typescript: "javascript",
  sql: "pglite",
  html: "html",
  php: "php",
  ruby: "ruby",
};

/** The engine that runs a language, if any does yet. */
export function engineFor(language: string | undefined): Engine | undefined {
  const id = language && BY_LANGUAGE[language];
  return id ? ENGINES[id] : undefined;
}

/** Languages with an engine. */
export const RUNNABLE_LANGUAGES = Object.keys(BY_LANGUAGE);
