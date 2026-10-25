import { MM_JSON_C, MM_JSON_H, MM_MAIN_C } from "./clang-support";
import { PRELUDE } from "./shared";

/**
 * C and C++ on Clang/LLD compiled to WebAssembly (YoWASP), targeting WASI. The solution, the
 * challenge's adapter (which turns a case's JSON arguments into C or C++ values) and a small JSON
 * library are compiled into one program; every case then runs as a fresh instance of it with
 * only WASI imports, so a crash stays with its case and the program never touches this
 * worker's JavaScript. That is also why this sandbox may be kept between runs: LLVM takes
 * seconds to load.
 */
export const CLANG_WORKER =
  PRELUDE +
  String.raw`
let commands = null;
let wasi = null;
const SUPPORT = ${JSON.stringify({ "mm_json.h": MM_JSON_H, "mm_json.c": MM_JSON_C, "mm_main.c": MM_MAIN_C })};

async function boot(assets) {
  const files = new Map(Object.entries(assets));
  // The toolchain reads its wasm and headers through fetch; answer from memory only.
  self.fetch = async (resource) => {
    const name = new URL(String(resource)).pathname.split("/").pop();
    if (!files.has(name)) throw new TypeError("Network access is disabled.");
    const type = name.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
    return new Response(files.get(name), { headers: { "content-type": type } });
  };
  const url = URL.createObjectURL(new Blob([assets["clang.js"]], { type: "text/javascript" }));
  ({ commands, wasi } = await import(url));
  // The first compile loads LLVM; do it now, not on the person's first run.
  await compile("c", "warm.c", "int mm_warm(void) { return 0; }", null, ["-c"]);
}

/** "src/ring_buffer.c" → { src: { "ring_buffer.c": text } } */
function tree(files) {
  const root = {};
  for (const [path, text] of Object.entries(files)) {
    const parts = path.split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) dir = dir[part] ??= {};
    dir[parts[parts.length - 1]] = text;
  }
  return root;
}

async function compile(language, filename, code, adapter, extra = []) {
  const cpp = language === "cpp";
  const ext = cpp ? "cpp" : "c";
  const sources = { ...SUPPORT, [filename]: code };
  if (adapter) sources["adapter." + ext] = adapter;
  const dir = filename.includes("/") ? filename.slice(0, filename.lastIndexOf("/")) : ".";
  const args = [
    ...(cpp ? ["-std=c++20", "-fno-exceptions"] : ["-std=c17"]),
    // C++ compiles against libc++'s headers; -O0 keeps that to a few seconds.
    cpp ? "-O0" : "-O1", "-Wall", "-I.", "-I" + dir, "-fdiagnostics-color=never",
    ...extra,
    filename,
    ...(adapter ? ["adapter." + ext] : []),
    ...(extra.includes("-c") ? [] : [...(cpp ? ["-x", "c++"] : []), "mm_json.c", "mm_main.c", "-o", "program.wasm"]),
  ];
  let messages = "";
  const stderr = (bytes) => {
    if (bytes) messages += new TextDecoder().decode(bytes);
  };
  try {
    const out = await commands[cpp ? "clang++" : "clang"](args, tree(sources), { stderr });
    return { ok: true, wasm: out && out["program.wasm"], messages };
  } catch (error) {
    if (error && typeof error.code === "number") return { ok: false, messages };
    throw error;
  }
}

const TRAPS = [
  [/out of bounds/, "Segmentation fault (memory access out of bounds)"],
  [/unreachable/, "Aborted (abort(), a failed assert, or undefined behaviour)"],
  [/divide by zero/, "Floating point exception (integer divide by zero)"],
  [/call stack|stack overflow|too much recursion/i, "Stack overflow"],
];

function crash(error, filename) {
  const raw = String(error && error.message || error);
  const message = (TRAPS.find(([pattern]) => pattern.test(raw)) || [, raw])[1];
  return { type: "Crash", message, traceback: bounded(message + " in " + filename + "\n") };
}

async function execute({ code, parameters, inputs, filename, language, adapter }) {
  const built = await compile(language, filename, code, adapter);
  if (built.messages) write("stderr", built.messages);
  if (!built.ok)
    return {
      phase: "compile",
      error: { type: "CompileError", message: "The code did not compile.", traceback: bounded(built.messages) },
      tests: [],
    };
  const module = await WebAssembly.compile(built.wasm);
  const encoder = new TextEncoder();
  const tests = [];
  for (const [index, input] of inputs.entries()) {
    const args = Array.isArray(parameters) ? input : [input];
    const root = new wasi.PreopenDirectory("/", new Map());
    const fds = [
      new wasi.OpenFile(new wasi.File(encoder.encode(JSON.stringify(args)))),
      wasi.ConsoleStdout.lineBuffered((line) => write("stdout", line + "\n")),
      wasi.ConsoleStdout.lineBuffered((line) => write("stderr", line + "\n")),
      root,
    ];
    const system = new wasi.WASI(["program"], [], fds, { debug: false });
    try {
      const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: system.wasiImport });
      const status = system.start(instance);
      if (status !== 0) {
        tests.push({ index, error: { type: "Exit", message: "The program exited with status " + status + ".", traceback: bounded("") } });
        continue;
      }
    } catch (error) {
      tests.push({ index, error: crash(error, filename) });
      continue;
    }
    const file = root.dir.contents.get("result.json");
    const text = file ? new TextDecoder().decode(file.data) : "";
    if (!text) {
      tests.push({ index, error: { type: "Exit", message: "The adapter returned no result.", traceback: bounded("") } });
      continue;
    }
    tests.push({ index, output: bounded(text), repr: bounded(text, 2000) });
  }
  return { phase: "tests", tests };
}
`;
