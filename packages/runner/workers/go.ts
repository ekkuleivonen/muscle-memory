import { PRELUDE } from "./shared";

/**
 * Go on Yaegi, the Go interpreter, built to WebAssembly from tools/runtimes/go. The harness
 * evaluates the solution's package and calls the entry point per case, decoding JSON inputs
 * into its parameter types; (value, ok) and (value, error) returns that fail are null.
 * fmt.Print output arrives through Go's console writer.
 */
export const GO_WORKER =
  PRELUDE +
  String.raw`
async function boot(assets) {
  importScripts(URL.createObjectURL(new Blob([assets["wasm_exec.js"]], { type: "text/javascript" })));
  const go = new Go();
  const { instance } = await WebAssembly.instantiate(assets["go.wasm"], go.importObject);
  // Runs until the page drops the sandbox; main registers __mmGoRun and then waits.
  go.run(instance);
  if (typeof globalThis.__mmGoRun !== "function") throw new Error("The Go runner did not start.");
}

async function execute({ code, entrypoint, parameters, inputs, filename }) {
  const raw = await globalThis.__mmGoRun(
    JSON.stringify({ code, file: filename, entrypoint, inputs, spread: Array.isArray(parameters) }),
  );
  const result = JSON.parse(raw);
  const fix = (error) =>
    error && { type: error.type, message: String(error.message).slice(0, 2000), traceback: bounded(error.traceback || "") };
  return {
    phase: result.phase,
    ...(result.error ? { error: fix(result.error) } : {}),
    tests: (result.tests || []).map(({ json, repr, error, ...rest }) => ({
      ...rest,
      ...(json !== undefined ? { output: bounded(json) } : {}),
      ...(repr !== undefined ? { repr: bounded(repr, 2000) } : {}),
      ...(error ? { error: fix(error) } : {}),
    })),
  };
}
`;
