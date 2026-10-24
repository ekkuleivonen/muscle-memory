import { PRELUDE } from "./shared";

/**
 * PHP on php-wasm (PHP 8.4 compiled with Emscripten). The solution is written into PHP's
 * in-memory file system at its repo path and required, so errors name the right file and
 * line. A small PHP harness calls the entry point per case and writes the results as JSON
 * to another in-memory file; echo and warnings from the solution are its stdout.
 */
export const PHP_WORKER =
  PRELUDE +
  String.raw`
let php = null;
let fs = null;
// PHP writes bytes one at a time; these keep multi-byte characters whole.
const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };

async function boot(assets) {
  // The web build of PHP expects a page (for canvas and fullscreen helpers PHP never uses
  // here); a worker has none, so it gets an inert stand-in.
  const inert = () => null;
  self.document = {
    currentScript: null,
    body: null,
    getElementById: inert,
    querySelector: inert,
    addEventListener: inert,
    removeEventListener: inert,
  };
  self.window = self;
  const url = URL.createObjectURL(new Blob([assets["php.js"]], { type: "text/javascript" }));
  const { PhpBase, runtime } = await import(url);
  php = new PhpBase(Promise.resolve(runtime), {
    // Instantiated from the verified bytes; the loader would otherwise fetch its wasm.
    instantiateWasm(imports, done) {
      WebAssembly.instantiate(assets["php.wasm"], imports).then(({ instance, module }) =>
        done(instance, module),
      );
      return {};
    },
    stdout: (byte) => output && write("stdout", decoders.stdout.decode(Uint8Array.of(byte), { stream: true })),
    stderr: (byte) => output && write("stderr", decoders.stderr.decode(Uint8Array.of(byte), { stream: true })),
  });
  fs = (await php.binary).FS;
}

function writeFile(path, text) {
  const parts = path.split("/").filter(Boolean);
  let dir = "";
  for (const part of parts.slice(0, -1)) {
    dir += "/" + part;
    if (!fs.analyzePath(dir).exists) fs.mkdir(dir);
  }
  fs.writeFile(path, text);
}

const HARNESS = ${JSON.stringify(`<?php
$mm = json_decode(file_get_contents('/mm/request.json'), true);
$mmError = function (Throwable $e): array {
    $trace = get_class($e) . ': ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine()
        . "\\nStack trace:\\n" . $e->getTraceAsString() . "\\n";
    return ['type' => get_class($e), 'message' => substr($e->getMessage(), 0, 2000),
        'traceback' => ['text' => $trace, 'bytes' => strlen($trace), 'truncated' => false]];
};
$mmWrite = fn (array $result) => file_put_contents('/mm/result.json', json_encode($result));
try {
    require $mm['file'];
} catch (ParseError $e) {
    $mmWrite(['phase' => 'compile', 'error' => $mmError($e), 'tests' => []]);
    return;
} catch (Throwable $e) {
    $mmWrite(['phase' => 'execute', 'error' => $mmError($e), 'tests' => []]);
    return;
}
if (!function_exists($mm['entrypoint'])) {
    $message = 'Define a function named ' . $mm['entrypoint'] . '.';
    $mmWrite(['phase' => 'execute', 'tests' => [], 'error' => ['type' => 'Error',
        'message' => $message, 'traceback' => ['text' => '', 'bytes' => 0, 'truncated' => false]]]);
    return;
}
$tests = [];
foreach ($mm['inputs'] as $index => $input) {
    try {
        $actual = $mm['spread'] ? ($mm['entrypoint'])(...$input) : ($mm['entrypoint'])($input);
    } catch (Throwable $e) {
        $tests[] = ['index' => $index, 'error' => $mmError($e)];
        continue;
    }
    $json = json_encode($actual, JSON_PRESERVE_ZERO_FRACTION);
    $repr = var_export($actual, true);
    $tests[] = $json === false
        ? ['index' => $index, 'unserializable' => json_last_error_msg(), 'repr' => $repr]
        : ['index' => $index, 'json' => $json, 'repr' => $repr];
}
$mmWrite(['phase' => 'tests', 'tests' => $tests]);
`)};

async function execute({ code, entrypoint, parameters, inputs, filename }) {
  const file = "/app/" + filename;
  writeFile(file, code);
  writeFile(
    "/mm/request.json",
    JSON.stringify({ file, entrypoint, inputs, spread: Array.isArray(parameters) }),
  );
  if (fs.analyzePath("/mm/result.json").exists) fs.unlink("/mm/result.json");
  try {
    await php.run(HARNESS);
  } catch {
    // A fatal error ends the script; what PHP printed explains it.
  }
  if (!fs.analyzePath("/mm/result.json").exists) {
    const printed = output.stdout.text.trim().split("\n").slice(-6).join("\n");
    return {
      phase: "execute",
      tests: [],
      error: {
        type: "FatalError",
        message: "PHP stopped before the checks finished (a fatal error, or exit).",
        traceback: bounded(printed + "\n"),
      },
    };
  }
  const result = JSON.parse(fs.readFile("/mm/result.json", { encoding: "utf8" }));
  result.tests = result.tests.map(({ json, repr, ...rest }) => ({
    ...rest,
    ...(json !== undefined ? { output: bounded(json) } : {}),
    ...(repr !== undefined ? { repr: bounded(repr, 2000) } : {}),
  }));
  // Repo-relative paths, without the harness's own frames.
  const tidy = (error) => {
    const text = error.traceback.text
      .split("\n")
      .filter((line) => !line.includes("php-wasm run script"))
      .join("\n")
      .split("/app/")
      .join("");
    error.traceback = bounded(text);
  };
  for (const test of result.tests) if (test.error) tidy(test.error);
  if (result.error) tidy(result.error);
  return result;
}
`;
