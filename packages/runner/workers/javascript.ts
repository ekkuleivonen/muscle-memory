import { PRELUDE } from "./shared";

/**
 * JavaScript and TypeScript on the browser's own engine. TypeScript types are stripped with
 * Sucrase (line numbers are kept, so stack traces point at the right line); nothing is
 * type-checked here. Each source file becomes an ES module at a blob URL, its relative imports
 * rewritten to its siblings' URLs, and the entry file's exported entry point is called once
 * per case. Imports that are not relative (packages) are not available.
 */
export const JAVASCRIPT_WORKER =
  PRELUDE +
  String.raw`
let transform = null;

async function boot(assets) {
  const url = URL.createObjectURL(new Blob([assets["transpiler.js"]], { type: "text/javascript" }));
  ({ transform } = await import(url));
}

function syntaxError(error, filename) {
  const message = String(error && error.message || error).replace(/^Error transforming [^:]*: /, "");
  const at = /\((\d+):(\d+)\)\s*$/.exec(message);
  const where = at ? "  at " + filename + ":" + at[1] + ":" + (Number(at[2]) + 1) + "\n" : "";
  return {
    type: "SyntaxError",
    message: message.slice(0, 2000),
    traceback: bounded("SyntaxError: " + message + "\n" + where),
  };
}

/** "src/cart/totals.ts" + "./discounts" → the source file it names, or null. */
function resolve(sources, from, spec) {
  const parts = from.split("/").slice(0, -1);
  for (const part of spec.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  const base = parts.join("/");
  const extension = base.replace(/\.(js|mjs|cjs)$/, "");
  for (const candidate of [
    base, extension + ".ts", extension + ".tsx", base + ".js", base + ".ts",
    base + "/index.ts", base + "/index.js",
  ])
    if (Object.prototype.hasOwnProperty.call(sources, candidate)) return candidate;
  return null;
}

class LinkError extends Error {}

/** Transpiles one file and the files it imports, bottom-up; returns its URL. */
function link(sources, path, urls, linking) {
  if (urls.has(path)) return urls.get(path);
  if (linking.has(path))
    throw new LinkError("Circular import: " + [...linking, path].join(" → "));
  linking.add(path);
  let js;
  try {
    js = transform(sources[path], {
      transforms: /\.tsx?$/.test(path) ? ["typescript"] : [],
      filePath: path,
      disableESTransforms: true,
    }).code;
  } catch (error) {
    error.path = path;
    throw error;
  }
  js = js.replace(
    /(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.{1,2}\/[^"']+)\2/g,
    (match, before, quote, spec) => {
      const target = resolve(sources, path, spec);
      if (!target)
        throw new LinkError("Cannot find module '" + spec + "' imported from " + path + ".");
      return before + quote + link(sources, target, urls, linking) + quote;
    },
  );
  const url = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
  urls.set(path, url);
  linking.delete(path);
  return url;
}

async function execute({ code, files, entrypoint, parameters, inputs, filename }) {
  const sources = { ...(files || {}), [filename]: code };
  const urls = new Map();
  let entry;
  try {
    entry = link(sources, filename, urls, new Set());
  } catch (error) {
    if (error instanceof LinkError)
      return {
        phase: "compile",
        tests: [],
        error: { type: "ImportError", message: error.message, traceback: bounded(error.message + "\n") },
      };
    return { phase: "compile", error: syntaxError(error, error.path || filename), tests: [] };
  }
  const where = [...urls].map(([path, url]) => [url, path]);
  let module;
  try {
    module = await import(entry);
  } catch (error) {
    const phase = error instanceof SyntaxError ? "compile" : "execute";
    return { phase, error: codeError(error, filename, where), tests: [] };
  }
  const fn = module[entrypoint];
  if (typeof fn !== "function")
    return {
      phase: "execute",
      tests: [],
      error: {
        type: "ReferenceError",
        message: "Export a function named " + entrypoint + ".",
        traceback: bounded(""),
      },
    };
  const tests = [];
  for (const [index, input] of inputs.entries()) {
    // A fresh copy per case, so a function that mutates its input cannot affect the next.
    const args = argumentsOf(JSON.parse(JSON.stringify(input)), parameters);
    try {
      let actual = fn(...args);
      if (actual && typeof actual.then === "function") actual = await actual;
      tests.push({ index, ...convert(actual) });
    } catch (error) {
      tests.push({ index, error: codeError(error, filename, where) });
    }
  }
  return { phase: "tests", tests };
}
`;
