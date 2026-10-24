/**
 * Isolation boundary for submitted Python. Code runs in a dedicated worker created inside a
 * `sandbox="allow-scripts"` srcdoc iframe: an opaque origin with no access to the app's DOM,
 * cookies or storage. The frame's CSP denies every connection, so neither the frame nor its
 * blob worker (which inherits the policy) can reach the network. Runtime bytes arrive by
 * postMessage after the trusted parent has verified their hashes.
 */

/** Runs in the sandbox document. It only relays a bounded number of worker messages. */
export const BOOT_SCRIPT = String.raw`(() => {
  if (self.origin !== "null") throw new Error("Sandbox requires an opaque origin.");
  let worker = null;
  let relayed = 0;
  const send = (message) => parent.postMessage(message, "*");
  addEventListener("message", (event) => {
    if (event.source !== parent) return;
    const message = event.data;
    if (message && message.type === "init" && !worker) {
      try {
        const url = URL.createObjectURL(
          new Blob([message.workerSource], { type: "text/javascript" }),
        );
        // Classic: module workers from blob URLs do not load in an opaque origin.
        worker = new Worker(url);
      } catch (error) {
        send({ type: "boot-failed", message: "Worker unavailable: " + error });
        return;
      }
      worker.onmessage = (workerEvent) => {
        if (++relayed <= 64) send(workerEvent.data);
      };
      worker.onerror = (workerEvent) => {
        workerEvent.preventDefault();
        send({ type: "boot-failed", message: String(workerEvent.message) });
      };
      worker.postMessage({ type: "init", assets: message.assets, lock: message.lock });
    } else if (message && message.type === "run" && worker) {
      worker.postMessage(message);
    }
  });
  send({ type: "frame-ready" });
})();`;

/** Classic worker source. Serves runtime files from memory; nothing is fetched. */
export const WORKER_SCRIPT = String.raw`
const HARNESS = ${JSON.stringify(
  // Defines __mm_run(code, inputs_json, ...) -> JSON result. Each run uses a fresh interpreter,
  // so state left by user code never reaches another run.
  `
import json, sys, traceback

def __mm_bounded(text, limit):
    data = text.encode("utf-8", "replace")
    if len(data) <= limit:
        return {"text": text, "bytes": len(data), "truncated": False}
    return {"text": data[:limit].decode("utf-8", "ignore"), "bytes": len(data), "truncated": True}

def __mm_text(error, limit):
    # A user exception's __str__ is user code and may fail as well.
    try:
        return str(error)[:limit]
    except BaseException:
        return "<unprintable " + type(error).__name__ + ">"

def __mm_error(error, limit):
    try:
        lines = traceback.format_exception(error)
        # Drop the harness's own frames so tracebacks point at solution.py.
        text = "".join(line for line in lines if '"<exec>"' not in line)
    except BaseException:
        text = type(error).__name__ + ": " + __mm_text(error, 2000) + "\\n"
    return {"type": type(error).__name__, "message": __mm_text(error, 2000),
            "traceback": __mm_bounded(text, limit)}

__mm_keep = []

def __mm_too_deep(value, limit):
    # Iterative, so measuring depth cannot itself overflow the stack.
    stack = [(value, 1)]
    visited = 0
    while stack:
        item, depth = stack.pop()
        if depth > limit:
            return True
        visited += 1
        if visited > 1000000:
            return False
        if isinstance(item, dict):
            stack.extend((child, depth + 1) for child in item.keys())
            stack.extend((child, depth + 1) for child in item.values())
        elif isinstance(item, (list, tuple, set, frozenset)):
            stack.extend((child, depth + 1) for child in item)
    return False

def __mm_run(code, inputs_json, function_name, limit):
    tests = [json.dumps(value) for value in json.loads(inputs_json)]
    namespace = {"__name__": "solution"}
    try:
        compiled = compile(code, "solution.py", "exec")
    except SyntaxError as error:
        return json.dumps({"phase": "compile", "error": __mm_error(error, limit), "tests": []})
    try:
        exec(compiled, namespace)
    except BaseException as error:
        return json.dumps({"phase": "execute", "error": __mm_error(error, limit), "tests": []})
    function = namespace.get(function_name)
    if not callable(function):
        return json.dumps({"phase": "execute", "tests": [], "error": {
            "type": "NameError", "message": f"Define a function named {function_name}.",
            "traceback": __mm_bounded("", limit)}})
    # Raw outputs only. Scoring happens outside the sandbox, against canonical JSON.
    results = []
    for index, case in enumerate(tests):
        try:
            actual = function(json.loads(case))
        except BaseException as error:
            results.append({"index": index, "error": __mm_error(error, limit)})
            continue
        # Converting the return value runs user code too (__repr__, very deep nesting).
        # Its failures belong to this case, and earlier cases are kept.
        # Returned values stay referenced until the sandbox is destroyed: freeing a
        # deeply nested value recurses in C and would exhaust the wasm stack.
        __mm_keep.append(actual)
        result = {"index": index}
        results.append(result)
        try:
            # repr/json.dumps recurse in C, which exhausts the wasm stack (a JS
            # RangeError that ends the whole run) long before Python's guard fires.
            too_deep = __mm_too_deep(actual, 500)
        except BaseException as error:
            result["conversionError"] = __mm_error(error, limit)
            continue
        if too_deep:
            result["conversionError"] = __mm_error(RecursionError(
                "Return value is nested more than 500 levels deep or is cyclic; "
                "it was not converted."), limit)
            continue
        try:
            result["repr"] = __mm_bounded(repr(actual), 2000)
        except BaseException as error:
            result["conversionError"] = __mm_error(error, limit)
        try:
            result["output"] = __mm_bounded(json.dumps(actual, allow_nan=False), limit)
        except (TypeError, ValueError) as error:
            result["unserializable"] = __mm_text(error, 500)
        except BaseException as error:
            result.setdefault("conversionError", __mm_error(error, limit))
    return json.dumps({"phase": "tests", "tests": results})
`,
)};

const OUTPUT_LIMIT = 65536;
let pyodide = null;
let output = null;

function capture(stream) {
  return {
    write(bytes) {
      const record = output[stream];
      record.bytes += bytes.length;
      const room = OUTPUT_LIMIT - record.kept;
      if (room > 0) {
        const kept = bytes.subarray(0, room);
        record.chunks.push(kept.slice());
        record.kept += kept.length;
      }
      return bytes.length;
    },
  };
}

function collect(stream) {
  const record = output[stream];
  const joined = new Uint8Array(record.kept);
  let offset = 0;
  for (const chunk of record.chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return {
    text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(joined),
    bytes: record.bytes,
    truncated: record.bytes > record.kept,
  };
}

async function boot({ assets, lock }) {
  const started = performance.now();
  const files = new Map(Object.entries(assets));
  const moduleUrl = (name) =>
    URL.createObjectURL(new Blob([files.get(name)], { type: "text/javascript" }));
  // Pyodide reads its wasm and standard library through fetch; answer from memory only.
  self.fetch = async (resource) => {
    const name = new URL(String(resource)).pathname.split("/").pop();
    if (!files.has(name)) throw new TypeError("Network access is disabled.");
    const type = name.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
    return new Response(files.get(name), { headers: { "content-type": type } });
  };
  const { loadPyodide } = await import(moduleUrl("pyodide.mjs"));
  const createPyodideModule = (await import(moduleUrl("pyodide.asm.mjs"))).default;
  pyodide = await loadPyodide({
    indexURL: "https://runtime.invalid/",
    stdLibURL: "https://runtime.invalid/python_stdlib.zip",
    packageBaseUrl: "https://runtime.invalid/",
    // No packages beyond the standard library: imports of others fail without any fetch.
    lockFileContents: JSON.stringify({ info: lock, packages: {} }),
    createPyodideModule,
  });
  files.clear();
  self.fetch = async () => {
    throw new TypeError("Network access is disabled.");
  };
  pyodide.setStdout(capture("stdout"));
  pyodide.setStderr(capture("stderr"));
  pyodide.runPython(HARNESS);
  postMessage({ type: "ready", bootMs: Math.round(performance.now() - started) });
}

function run({ runId, code, inputs, functionName }) {
  output = {
    stdout: { chunks: [], kept: 0, bytes: 0 },
    stderr: { chunks: [], kept: 0, bytes: 0 },
  };
  const started = performance.now();
  let result;
  try {
    const raw = pyodide.globals
      .get("__mm_run")(code, JSON.stringify(inputs), functionName, OUTPUT_LIMIT);
    result = { type: "result", runId, ...JSON.parse(raw) };
  } catch (error) {
    result = { type: "runner-error", runId, message: String(error).slice(0, 2000) };
  }
  postMessage({
    ...result,
    stdout: collect("stdout"),
    stderr: collect("stderr"),
    durationMs: Math.round(performance.now() - started),
  });
}

let booted = false;
self.onmessage = (event) => {
  const message = event.data;
  if (message.type === "init" && !booted) {
    booted = true;
    boot(message).catch((error) =>
      postMessage({ type: "boot-failed", message: String(error).slice(0, 2000) }),
    );
  } else if (message.type === "run" && pyodide) run(message);
};
`;

export const SANDBOX_CSP = (bootHash: string) =>
  [
    "default-src 'none'",
    `script-src '${bootHash}' blob: 'wasm-unsafe-eval'`,
    "worker-src blob:",
    "connect-src 'none'",
    "img-src 'none'",
    "style-src 'none'",
    "font-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");

/** The srcdoc for one sandbox. The inline boot script is allowed only by its exact hash. */
export async function sandboxDocument(): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(BOOT_SCRIPT),
  );
  const hash = "sha256-" + btoa(String.fromCharCode(...new Uint8Array(digest)));
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP(hash)}"></head><body><script>${BOOT_SCRIPT}</script></body></html>`;
}
