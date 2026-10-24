import { PRELUDE } from "./shared";

/**
 * JavaScript and TypeScript on the browser's own engine. TypeScript types are stripped with
 * Sucrase (line numbers are kept, so stack traces point at the right line); nothing is
 * type-checked here. The solution is loaded as an ES module from a blob URL and its exported
 * entry point is called once per case.
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

async function execute({ code, entrypoint, parameters, inputs, filename, language }) {
  let js;
  try {
    js = transform(code, {
      transforms: language === "typescript" ? ["typescript"] : [],
      filePath: filename,
      disableESTransforms: true,
    }).code;
  } catch (error) {
    return { phase: "compile", error: syntaxError(error, filename), tests: [] };
  }
  const url = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
  let module;
  try {
    module = await import(url);
  } catch (error) {
    const phase = error instanceof SyntaxError ? "compile" : "execute";
    return { phase, error: codeError(error, filename, [url]), tests: [] };
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
      tests.push({ index, error: codeError(error, filename, [url]) });
    }
  }
  return { phase: "tests", tests };
}
`;
