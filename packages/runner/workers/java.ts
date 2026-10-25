import { JSON_JAVA, MAIN_JAVA, RESULT_MARK } from "./java-support";
import { PRELUDE } from "./shared";

/**
 * Java on teavm-javac: OpenJDK's javac and the TeaVM compiler, both compiled to WebAssembly.
 * javac compiles the solution, the challenge's adapter and a small JSON library; TeaVM turns the
 * classes into a WebAssembly program, and every case runs as a fresh instance of it, with the
 * case's arguments as main's only argument. System.out arrives through console.log; the
 * harness's own result line is marked so it can be told apart.
 */
export const JAVA_WORKER =
  PRELUDE +
  String.raw`
let load = null;
let compiler = null;
let diagnostics = [];
const MARK = ${JSON.stringify(RESULT_MARK)};
const SUPPORT = ${JSON.stringify({ "Json.java": JSON_JAVA, "MmMain.java": MAIN_JAVA })};

async function boot(assets) {
  const url = URL.createObjectURL(new Blob([assets["teavm.js"]], { type: "text/javascript" }));
  ({ load } = await import(url));
  compiler = (await load(assets["compiler.wasm"])).exports.createCompiler();
  compiler.setSdk(new Int8Array(assets["compile-classlib.bin"]));
  compiler.setTeaVMClasslib(new Int8Array(assets["runtime-classlib.bin"]));
  compiler.onDiagnostic((d) =>
    diagnostics.push({
      type: d.type,
      severity: d.severity,
      file: d.fileName,
      line: d.lineNumber,
      column: d.type === "javac" ? d.columnNumber : undefined,
      message: d.message,
    }),
  );
  // The first TeaVM compile takes seconds; do it now, not on the person's first run.
  build("Warm.java", "final class Adapter { static Object call(Json args) { return 1; } }", "");
}

/** javac's own format: "src/Main.java:3: error: ';' expected". */
function report(kind) {
  return diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => (d.file ? d.file + ":" + d.line + ": " : "") + kind + ": " + d.message)
    .join("\n") + "\n";
}

function build(filename, code, adapter) {
  diagnostics = [];
  compiler.clearSourceFiles();
  compiler.clearOutputFiles();
  compiler.addSourceFile(filename, code);
  if (adapter) compiler.addSourceFile("Adapter.java", adapter);
  for (const [name, text] of Object.entries(SUPPORT)) compiler.addSourceFile(name, text);
  if (!compiler.compile()) return { error: { type: "CompileError", message: "The code did not compile.", traceback: bounded(report("error")) } };
  if (!compiler.generateWebAssembly({ outputName: "app", mainClass: "MmMain" }))
    return { error: { type: "CompileError", message: "TeaVM could not compile the program.", traceback: bounded(report("teavm")) } };
  return { wasm: compiler.getWebAssemblyOutputFile("app.wasm") };
}

/** Runs main once; the marked line is the harness's result, everything else is output. */
async function runCase(wasm, args) {
  let result = null;
  const log = console.log;
  console.log = (...parts) => {
    const line = parts.map(String).join(" ");
    if (line.startsWith(MARK)) result = line.slice(MARK.length);
    else log(line);
  };
  try {
    const app = await load(wasm);
    app.exports.main([JSON.stringify(args)]);
  } finally {
    console.log = log;
  }
  return result;
}

async function execute({ code, parameters, inputs, filename, adapter }) {
  // TeaVM's own JavaScript interop is not Java, and does not work in compiled solutions.
  const interop = /\borg\s*\.\s*teavm\b/.exec(code);
  if (interop) {
    const line = code.slice(0, interop.index).split("\n").length;
    const text = filename + ":" + line + ": error: TeaVM's JavaScript interop (org.teavm) is not available; write plain Java.\n";
    return { phase: "compile", error: { type: "CompileError", message: "The code did not compile.", traceback: bounded(text) }, tests: [] };
  }
  const built = build(filename, code, adapter);
  if (built.error) return { phase: "compile", error: built.error, tests: [] };
  const tests = [];
  for (const [index, input] of inputs.entries()) {
    const args = Array.isArray(parameters) ? input : [input];
    let line;
    try {
      line = await runCase(built.wasm, args);
    } catch (error) {
      // An exception the harness could not catch, or a trap in the program.
      tests.push({ index, error: { type: "Crash", message: String(error && error.message || error), traceback: bounded(String(error) + "\n") } });
      continue;
    }
    if (line === null) {
      tests.push({ index, error: { type: "Exit", message: "The program ended without a result.", traceback: bounded("") } });
      continue;
    }
    const result = JSON.parse(line);
    if (result.error)
      tests.push({ index, error: { ...result.error, traceback: bounded(result.error.traceback) } });
    else {
      const text = JSON.stringify(result.json);
      tests.push({ index, output: bounded(text), repr: bounded(text, 2000) });
    }
  }
  return { phase: "tests", tests };
}
`;
