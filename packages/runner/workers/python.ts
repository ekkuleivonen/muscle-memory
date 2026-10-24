/**
 * Python on Pyodide. Classic worker source; serves runtime files from memory, nothing is
 * fetched.
 */
export const PYTHON_WORKER = String.raw`
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
        # Drop the harness's own frames so tracebacks point at the solution file.
        text = "".join(line for line in lines if '"<exec>"' not in line)
    except BaseException:
        text = type(error).__name__ + ": " + __mm_text(error, 2000) + "\\n"
    return {"type": type(error).__name__, "message": __mm_text(error, 2000),
            "traceback": __mm_bounded(text, limit)}

__mm_keep = []

class ConversionLimitError(Exception):
    pass

def __mm_unconvertible(value, depth_limit, item_limit):
    # Iterative, so inspecting the value cannot itself overflow the stack. A value that
    # cannot be inspected completely is refused, never assumed to be shallow.
    stack = [(value, 1)]
    items = 1
    while stack:
        item, depth = stack.pop()
        if depth > depth_limit:
            return RecursionError(
                f"Return value is nested more than {depth_limit} levels deep or is "
                "cyclic; it was not converted.")
        if isinstance(item, dict):
            children = [*item.keys(), *item.values()]
        elif isinstance(item, (list, tuple, set, frozenset)):
            children = list(item)
        else:
            continue
        items += len(children)
        if items > item_limit:
            return ConversionLimitError(
                f"Return value holds more than {item_limit} nested items, too many to "
                "inspect safely; it was not converted.")
        stack.extend((child, depth + 1) for child in children)
    return None

def __mm_run(code, inputs_json, function_name, spread, filename, limit):
    tests = [json.dumps(value) for value in json.loads(inputs_json)]
    namespace = {"__name__": "solution"}
    try:
        compiled = compile(code, filename, "exec")
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
            args = json.loads(case)
            actual = function(*args) if spread else function(args)
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
            refusal = __mm_unconvertible(actual, 500, 1000000)
        except BaseException as error:
            result["conversionError"] = __mm_error(error, limit)
            continue
        if refusal is not None:
            result["conversionError"] = __mm_error(refusal, limit)
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

async function boot({ assets, config }) {
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
    lockFileContents: JSON.stringify({ info: config.lock, packages: {} }),
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

function run({ runId, code, inputs, entrypoint, parameters, filename }) {
  output = {
    stdout: { chunks: [], kept: 0, bytes: 0 },
    stderr: { chunks: [], kept: 0, bytes: 0 },
  };
  const started = performance.now();
  let result;
  try {
    const raw = pyodide.globals
      .get("__mm_run")(
        code,
        JSON.stringify(inputs),
        entrypoint,
        Array.isArray(parameters),
        filename,
        OUTPUT_LIMIT,
      );
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
