/**
 * Helpers every JavaScript-hosted worker starts with: bounded text, console capture, JSON
 * conversion of returned values and the init/run message loop. Prepended to a worker's own
 * source, so each engine only defines `boot(assets, config)` and `execute(request)`.
 */
export const PRELUDE = String.raw`
const OUTPUT_LIMIT = 65536;
const encoder = new TextEncoder();

function bounded(text, limit = OUTPUT_LIMIT) {
  const bytes = encoder.encode(text);
  if (bytes.length <= limit) return { text, bytes: bytes.length, truncated: false };
  return {
    text: new TextDecoder().decode(bytes.subarray(0, limit)).replace(/�$/, ""),
    bytes: bytes.length,
    truncated: true,
  };
}

/** console.* output, kept up to the limit per stream; the full size is still counted. */
let output = null;
function resetOutput() {
  output = { stdout: { text: "", bytes: 0 }, stderr: { text: "", bytes: 0 } };
}
function write(stream, text) {
  const record = output[stream];
  const size = encoder.encode(text).length;
  if (record.bytes < OUTPUT_LIMIT) record.text += text;
  record.bytes += size;
}
function collect(stream) {
  const { text, bytes } = output[stream];
  const kept = bounded(text);
  return { text: kept.text, bytes, truncated: bytes > kept.bytes };
}
function show(value) {
  if (typeof value === "string") return value;
  try {
    const text = JSON.stringify(value);
    if (text !== undefined) return text;
  } catch {}
  try {
    return String(value);
  } catch {
    return "<unprintable>";
  }
}
for (const [name, stream] of [
  ["log", "stdout"], ["info", "stdout"], ["debug", "stdout"],
  ["warn", "stderr"], ["error", "stderr"],
]) {
  console[name] = (...args) => output && write(stream, args.map(show).join(" ") + "\n");
}

/** A returned value as JSON, refusing what JSON cannot represent instead of guessing. */
function convert(value) {
  let refusal = null;
  let text;
  try {
    text = JSON.stringify(value, (key, item) => {
      if (typeof item === "number" && !Number.isFinite(item))
        refusal ??= "Out of range number (" + item + ") is not valid JSON.";
      if (typeof item === "bigint") {
        refusal ??= "BigInt values are not valid JSON.";
        return null;
      }
      return item;
    });
  } catch (error) {
    return { unserializable: String(error && error.message).slice(0, 500) };
  }
  if (text === undefined) refusal ??= (typeof value) + " is not valid JSON.";
  const repr = bounded(show(value), 2000);
  if (refusal) return { repr, unserializable: refusal };
  return { repr, output: bounded(text) };
}

/**
 * Rewrites runtime URLs in a stack so it points at the source files: each entry of urls is
 * a URL standing for filename, or a [url, path] pair for a program of several files.
 */
function codeError(error, filename, urls = []) {
  const pairs = urls.map((u) => (Array.isArray(u) ? u : [u, filename]));
  const type = (error && error.name) || "Error";
  let message;
  try {
    message = String(error && error.message !== undefined ? error.message : error);
  } catch {
    message = "<unprintable error>";
  }
  let stack = typeof (error && error.stack) === "string" ? error.stack : "";
  const lines = stack.split("\n").filter((line) => pairs.some(([url]) => line.includes(url)));
  let trace = lines.map((line) => {
    let out = line;
    for (const [url, path] of pairs) out = out.split(url).join(path);
    return "  " + out.trim();
  });
  const text = type + ": " + message + "\n" + trace.join("\n");
  return { type, message: message.slice(0, 2000), traceback: bounded(text.trimEnd() + "\n") };
}

/** One argument per case, or a list of arguments when the challenge names its parameters. */
function argumentsOf(input, parameters) {
  return Array.isArray(parameters) ? input : [input];
}

let ready = false;
let booted = false;
self.onmessage = async (event) => {
  const message = event.data;
  if (message.type === "init" && !booted) {
    booted = true;
    const started = performance.now();
    try {
      await boot(message.assets, message.config || {});
      ready = true;
      postMessage({ type: "ready", bootMs: Math.round(performance.now() - started) });
    } catch (error) {
      postMessage({ type: "boot-failed", message: String(error).slice(0, 2000) });
    }
  } else if (message.type === "run" && ready) {
    resetOutput();
    const started = performance.now();
    let result;
    try {
      result = { type: "result", runId: message.runId, ...(await execute(message)) };
    } catch (error) {
      result = { type: "runner-error", runId: message.runId, message: String(error).slice(0, 2000) };
    }
    postMessage({
      ...result,
      stdout: collect("stdout"),
      stderr: collect("stderr"),
      durationMs: Math.round(performance.now() - started),
    });
  }
};
`;
