/**
 * Builds every in-browser runtime into the app's static assets and verifies each file
 * against packages/runner/runtime-manifest.json. Pyodide and PGlite's binaries are copied
 * from node_modules; the JavaScript pieces (Sucrase, PGlite's module) are bundled into one
 * file each with esbuild, so the sandbox can load them from a single blob. No network access;
 * fails closed on any mismatch.
 *
 *   node tools/build-runtimes.mjs           build and verify
 *   node tools/build-runtimes.mjs --update  build and rewrite the pinned hashes (after an upgrade)
 */
import { createHash } from "node:crypto";
// Not node:zlib: its output differs between Node versions (and so CI and dev machines),
// which would break the pinned hashes. fflate's is the same everywhere.
import { gzipSync as fflateGzip } from "fflate";
const gzipSync = (bytes, { level }) =>
  Buffer.from(fflateGzip(bytes, { level, mtime: 0 }));
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, transform } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "packages/runner/runtime-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const update = process.argv.includes("--update");
const require = createRequire(join(root, "apps/web/package.json"));
// Not require.resolve(`${name}/package.json`): packages with "exports" may not expose it.
const packageDir = (name) =>
  require.resolve
    .paths(name)
    .map((dir) => join(dir, name))
    .find((dir) => existsSync(join(dir, "package.json")));
const versionOf = async (name) =>
  JSON.parse(await readFile(join(packageDir(name), "package.json"), "utf8"))
    .version;

async function bundle(source, define = {}, external = []) {
  const result = await build({
    stdin: {
      contents: source,
      resolveDir: join(root, "apps/web"),
      loader: "js",
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    legalComments: "inline",
    define,
    external,
    write: false,
    logLevel: "silent",
  });
  return result.outputFiles[0].contents;
}

/** Each engine: its npm package and the files it ships, by name. */
const ENGINES = {
  pyodide: {
    package: "pyodide",
    license: (v) =>
      `Pyodide ${v} (MPL-2.0), https://github.com/pyodide/pyodide\n`,
    files: async () => {
      const dir = packageDir("pyodide");
      const names = [
        "pyodide.mjs",
        "pyodide.asm.mjs",
        "pyodide.asm.wasm",
        "python_stdlib.zip",
      ];
      return Object.fromEntries(
        await Promise.all(
          names.map(async (n) => [n, await readFile(join(dir, n))]),
        ),
      );
    },
  },
  javascript: {
    package: "sucrase",
    license: (v) =>
      `Sucrase ${v} (MIT), https://github.com/alangpierce/sucrase\n`,
    files: async () => ({
      "transpiler.js": await bundle(`export { transform } from "sucrase";`),
    }),
  },
  html: {
    package: "linkedom",
    license: (v) =>
      `linkedom ${v} (ISC), https://github.com/WebReflection/linkedom\n`,
    files: async () => ({
      "dom.js": await bundle(`export { parseHTML } from "linkedom";`),
    }),
  },
  php: {
    package: "php-wasm",
    license: (v) =>
      `php-wasm ${v} (Apache-2.0, chosen from Apache-2.0 OR GPL-2.0), https://github.com/seanmorris/php-wasm\nPHP (PHP License 3.01), https://www.php.net/license/\n`,
    files: async () => {
      const dir = packageDir("php-wasm");
      const loader = await readFile(join(dir, "php8.4-web.mjs"), "utf8");
      const wasm = /"([0-9a-f]{40}\.wasm)"/.exec(loader)[1];
      return {
        // The wasm is handed over as bytes, so the loader never resolves its URL.
        "php.js": await bundle(
          `export { PhpBase } from "php-wasm/PhpBase.mjs";
           export * as runtime from "php-wasm/php8.4-web.mjs";`,
          { "import.meta.url": '"https://runtime.invalid/php.js"' },
        ),
        "php.wasm": await readFile(join(dir, wasm)),
      };
    },
  },
  ruby: {
    package: "@ruby/3.4-wasm-wasi",
    license: (v) =>
      `ruby.wasm ${v} (MIT), https://github.com/ruby/ruby.wasm\nCRuby (Ruby License or BSD-2-Clause), https://www.ruby-lang.org/en/about/license.txt\n`,
    files: async () => ({
      "ruby.js": await bundle(
        `export { DefaultRubyVM } from "@ruby/wasm-wasi/dist/browser";`,
      ),
      // 30 MB unpacked, over Cloudflare's 25 MiB per-file limit: shipped gzipped and
      // unpacked by the page after its hash is checked.
      "ruby.wasm.gz": gzipSync(
        await readFile(
          join(packageDir("@ruby/3.4-wasm-wasi"), "dist/ruby+stdlib.wasm"),
        ),
        { level: 9 },
      ),
    }),
  },
  // Not a runner: the editor's type checker for TypeScript and JavaScript (squiggles and
  // hover types; never completion).
  typescript: {
    package: "typescript",
    license: (v) =>
      `TypeScript ${v} (Apache-2.0), https://github.com/microsoft/TypeScript\n`,
    files: async () => {
      const dir = join(packageDir("typescript"), "lib");
      // The ES2023 library and everything it references; no DOM.
      const libs = {};
      const add = async (name) => {
        const file = `lib.${name}.d.ts`;
        if (libs[file]) return;
        libs[file] = await readFile(join(dir, file), "utf8");
        for (const [, ref] of libs[file].matchAll(/<reference lib="([^"]+)"/g))
          await add(ref);
      };
      await add("es2023");
      const source = await readFile(join(dir, "typescript.js"), "utf8");
      const { code } = await transform(source, {
        minify: true,
        legalComments: "inline",
      });
      return {
        "typescript.js": Buffer.from(code),
        "libs.json": Buffer.from(JSON.stringify(libs)),
      };
    },
  },
  go: {
    // Not an npm package: Yaegi's version is pinned in tools/runtimes/go/go.mod.
    version: async () =>
      /traefik\/yaegi v([\d.]+)/.exec(
        await readFile(join(root, "tools/runtimes/go/go.mod"), "utf8"),
      )[1],
    license: (v) =>
      `Yaegi ${v} (Apache-2.0), https://github.com/traefik/yaegi\nGo (BSD-3-Clause), https://go.dev/LICENSE\n`,
    files: async () => {
      const built = await goRunner();
      return {
        // 39 MB unpacked: shipped gzipped, unpacked by the page after its hash is checked.
        "go.wasm.gz": gzipSync(built["go.wasm"], { level: 9 }),
        "wasm_exec.js": built["wasm_exec.js"],
      };
    },
  },
  clang: {
    package: "@yowasp/clang",
    license: (v) =>
      `YoWASP Clang ${v} (ISC), https://yowasp.org/\nLLVM, Clang and LLD (Apache-2.0 WITH LLVM-exception), https://llvm.org/LICENSE.txt\nwasi-libc and libc++ (see their licenses in llvm-resources.tar)\nbrowser_wasi_shim (MIT OR Apache-2.0), https://github.com/bjorn3/browser_wasi_shim\n`,
    files: async () => {
      const gen = join(packageDir("@yowasp/clang"), "gen");
      const read = (name) => readFile(join(gen, name));
      return {
        // Its wasm and headers are served from memory, so URLs resolve against a dummy base;
        // the Node-only branch of its loader is left out.
        "clang.js": await bundle(
          `export { commands } from "@yowasp/clang";
           export * as wasi from "@bjorn3/browser_wasi_shim";`,
          { "import.meta.url": '"https://runtime.invalid/clang.js"' },
          ["node:*"],
        ),
        // 75 MB unpacked, over Cloudflare's 25 MiB per-file limit: shipped gzipped.
        "llvm.core.wasm.gz": gzipSync(await read("llvm.core.wasm"), {
          level: 9,
        }),
        "llvm.core2.wasm": await read("llvm.core2.wasm"),
        "llvm.core3.wasm": await read("llvm.core3.wasm"),
        "llvm.core4.wasm": await read("llvm.core4.wasm"),
        "llvm-resources.tar.gz": gzipSync(await read("llvm-resources.tar"), {
          level: 9,
        }),
      };
    },
  },
  csharp: {
    // Not an npm package: Roslyn's version is pinned in tools/runtimes/csharp/Runner.csproj.
    version: async () =>
      /Microsoft\.CodeAnalysis\.CSharp" Version="([\d.]+)"/.exec(
        await readFile(
          join(root, "tools/runtimes/csharp/Runner.csproj"),
          "utf8",
        ),
      )[1],
    license: (v) =>
      `Roslyn ${v} (MIT), https://github.com/dotnet/roslyn\n.NET runtime (MIT), https://github.com/dotnet/runtime\n`,
    files: csharpRunner,
  },
  java: {
    // Not an npm package: the teavm-javac commit is pinned above.
    version: async () => TEAVM_JAVAC.commit.slice(0, 7),
    license: (v) =>
      `teavm-javac ${v} (Apache-2.0), https://github.com/konsoletyper/teavm-javac\nOpenJDK javac (GPL-2.0 with the Classpath Exception), https://openjdk.org/legal/gplv2+ce.html\nTeaVM (Apache-2.0), https://teavm.org\n`,
    files: javaRunner,
  },
  pglite: {
    package: "@electric-sql/pglite",
    license: (v) =>
      `PGlite ${v} (Apache-2.0), https://github.com/electric-sql/pglite\nPostgreSQL (PostgreSQL License), https://www.postgresql.org/about/licence/\n`,
    files: async () => {
      const dist = join(packageDir("@electric-sql/pglite"), "dist");
      return {
        // Its wasm and data are handed over directly, so the module never resolves URLs
        // against its own (blob) location.
        "pglite.js": await bundle(
          `export { PGlite } from "@electric-sql/pglite";`,
          { "import.meta.url": '"https://runtime.invalid/pglite.js"' },
        ),
        "pglite.wasm": await readFile(join(dist, "pglite.wasm")),
        "initdb.wasm": await readFile(join(dist, "initdb.wasm")),
        "pglite.data": await readFile(join(dist, "pglite.data")),
      };
    },
  },
};

/**
 * The Go runner is built from tools/runtimes/go in a pinned Go image, so every machine and CI
 * produce the same bytes (checked against the pins like everything else). Builds are cached
 * by their inputs, so dev starts after the first do not rebuild.
 */
const GO_IMAGE =
  "golang:1.25.3-bookworm@sha256:4f43b271f9673eb7bd0cb3a49cc17b08d8d6ee110277e26dbacc93c43a5a7793";
async function goRunner() {
  const src = join(root, "tools/runtimes/go");
  const inputs = await Promise.all(
    ["main.go", "go.mod", "go.sum"].map((name) => readFile(join(src, name))),
  );
  const key = createHash("sha256")
    .update(GO_IMAGE)
    .update(Buffer.concat(inputs))
    .digest("hex")
    .slice(0, 16);
  const cache = join(
    root,
    "node_modules/.cache/muscle-memory-runtimes",
    `go-${key}`,
  );
  if (!existsSync(join(cache, "go.wasm"))) {
    await mkdir(cache, { recursive: true });
    console.log("building the Go runner (once per change, in Docker)…");
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-u",
        `${process.getuid()}:${process.getgid()}`,
        "-e",
        "HOME=/tmp",
        "-e",
        "GOCACHE=/tmp/gocache",
        "-e",
        "GOMODCACHE=/tmp/gomod",
        "-e",
        "GOOS=js",
        "-e",
        "GOARCH=wasm",
        "-v",
        `${src}:/src:ro`,
        "-v",
        `${cache}:/out`,
        "-w",
        "/src",
        GO_IMAGE,
        "sh",
        "-c",
        'go build -trimpath -ldflags="-s -w -buildid=" -o /out/go.wasm . && cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" /out/',
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
  }
  return {
    "go.wasm": await readFile(join(cache, "go.wasm")),
    "wasm_exec.js": await readFile(join(cache, "wasm_exec.js")),
  };
}

/**
 * The C# runner is a .NET WebAssembly app built from tools/runtimes/csharp in a pinned .NET SDK
 * image, cached by its inputs like the Go runner. Its files are the published _framework.
 */
const DOTNET_IMAGE =
  "mcr.microsoft.com/dotnet/sdk:9.0@sha256:d9ad72f6b3eb5d61adb158db510ae1c3098c12c92d23ab8da833418275f1c652";
async function csharpRunner() {
  const src = join(root, "tools/runtimes/csharp");
  const inputs = await Promise.all(
    ["Program.cs", "Runner.csproj"].map((name) => readFile(join(src, name))),
  );
  const key = createHash("sha256")
    .update(DOTNET_IMAGE)
    .update(Buffer.concat(inputs))
    .digest("hex")
    .slice(0, 16);
  const cache = join(
    root,
    "node_modules/.cache/muscle-memory-runtimes",
    `csharp-${key}`,
  );
  if (!existsSync(join(cache, "_framework", "blazor.boot.json"))) {
    await mkdir(cache, { recursive: true });
    console.log("building the C# runner (once per change, in Docker)…");
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-u",
        `${process.getuid()}:${process.getgid()}`,
        "-e",
        "HOME=/tmp",
        "-e",
        "DOTNET_CLI_TELEMETRY_OPTOUT=1",
        "-e",
        "DOTNET_NOLOGO=1",
        "-v",
        `${src}:/src:ro`,
        "-v",
        `${cache}:/out`,
        DOTNET_IMAGE,
        "sh",
        "-c",
        "cp -r /src /tmp/build && cd /tmp/build && dotnet publish -c Release -o /tmp/pub >/tmp/log 2>&1 || { cat /tmp/log; exit 1; }; cp -r /tmp/pub/wwwroot/_framework /out/",
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
  }
  const dir = join(cache, "_framework");
  const names = (await readdir(dir)).sort();
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [name, await readFile(join(dir, name))]),
    ),
  );
}

/**
 * The Java runner is teavm-javac (OpenJDK's javac and the TeaVM compiler, compiled to
 * WebAssembly), built from a pinned commit in a digest-pinned JDK image and cached like the
 * others. Its loader builds interop functions from source text, so the Java engine's
 * sandbox allows eval (see SANDBOX_CSP).
 */
const TEAVM_JAVAC = {
  repository: "https://github.com/konsoletyper/teavm-javac",
  commit: "208d4c97a602ba0df055f16e6882059fb69d0122",
};
const JDK_IMAGE =
  "eclipse-temurin:25-jdk@sha256:2d5d5e9b533342a565907c84f47a2ec298c40cde7b13a3ca85d4950fa456a641";
async function javaRunner() {
  const key = createHash("sha256")
    .update(JDK_IMAGE)
    .update(TEAVM_JAVAC.commit)
    .digest("hex")
    .slice(0, 16);
  const cache = join(
    root,
    "node_modules/.cache/muscle-memory-runtimes",
    `java-${key}`,
  );
  // Only the four outputs are kept: the build tree (OpenJDK's sources, Gradle's cache) runs
  // to gigabytes and is removed once they are copied out.
  const out = join(cache, "out");
  const outputs = {
    "compiler.wasm-runtime.js":
      "generated/teavm/wasm-gc/compiler.wasm-runtime.js",
    "compiler.wasm": "generated/teavm/wasm-gc/compiler.wasm",
    "compile-classlib-teavm.bin": "classlib/compile-classlib-teavm.bin",
    "runtime-classlib-teavm.bin": "classlib/runtime-classlib-teavm.bin",
  };
  if (!Object.keys(outputs).every((name) => existsSync(join(out, name)))) {
    const src = join(cache, "src");
    const gradle = join(cache, "gradle");
    await rm(src, { recursive: true, force: true });
    // Made here, not by Docker, which would create it owned by root.
    await mkdir(gradle, { recursive: true });
    console.log(
      "building the Java runner (teavm-javac, once per change, in Docker)…",
    );
    execFileSync("git", ["init", "-q", src]);
    execFileSync("git", [
      "-C",
      src,
      "fetch",
      "-q",
      "--depth",
      "1",
      TEAVM_JAVAC.repository,
      TEAVM_JAVAC.commit,
    ]);
    execFileSync("git", ["-C", src, "checkout", "-q", "FETCH_HEAD"]);
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-u",
        `${process.getuid()}:${process.getgid()}`,
        "-e",
        "HOME=/tmp",
        "-e",
        "GRADLE_USER_HOME=/gradle",
        "-v",
        `${src}:/src`,
        "-v",
        `${gradle}:/gradle`,
        "-w",
        "/src",
        JDK_IMAGE,
        "./gradlew",
        "--no-daemon",
        "-q",
        ":compiler:createDist",
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    await mkdir(out, { recursive: true });
    for (const [name, path] of Object.entries(outputs))
      await writeFile(
        join(out, name),
        await readFile(join(src, "compiler/build", path)),
      );
    await rm(src, { recursive: true, force: true });
    await rm(gradle, { recursive: true, force: true });
  }
  const read = (name) => readFile(join(out, name));
  return {
    "teavm.js": await read("compiler.wasm-runtime.js"),
    "compiler.wasm.gz": gzipSync(await read("compiler.wasm"), { level: 9 }),
    "compile-classlib.bin.gz": gzipSync(
      await read("compile-classlib-teavm.bin"),
      { level: 9 },
    ),
    "runtime-classlib.bin.gz": gzipSync(
      await read("runtime-classlib-teavm.bin"),
      { level: 9 },
    ),
  };
}

const integrity = (bytes) =>
  "sha256-" + createHash("sha256").update(bytes).digest("base64");

for (const [id, engine] of Object.entries(ENGINES)) {
  const pinned = manifest[id];
  const installed = engine.version
    ? await engine.version()
    : await versionOf(engine.package);
  if (installed !== pinned.version) {
    if (!update)
      throw new Error(
        `Installed ${engine.package ?? id} ${installed} does not match pinned ${pinned.version}. Run with --update after an upgrade.`,
      );
    pinned.version = installed;
    pinned.basePath = `/runtime/${id}-${installed}/`;
  }
  const files = await engine.files();
  const target = join(root, "apps/web/public", pinned.basePath);
  await mkdir(target, { recursive: true });
  const hashes = {};
  // Sizes let the page show download progress; they are checked along with the hashes.
  const sizes = {};
  for (const [name, bytes] of Object.entries(files)) {
    hashes[name] = integrity(bytes);
    sizes[name] = bytes.length;
    if (!update && pinned.files?.[name] !== hashes[name])
      throw new Error(
        `${id}/${name} hash ${hashes[name]} does not match pinned ${pinned.files?.[name]}.`,
      );
    await writeFile(join(target, name), bytes);
  }
  if (
    !update &&
    Object.keys(pinned.files).length !== Object.keys(hashes).length
  )
    throw new Error(`${id}: the pinned file list does not match the build.`);
  if (!update && JSON.stringify(pinned.sizes) !== JSON.stringify(sizes))
    throw new Error(`${id}: the pinned file sizes do not match the build.`);
  pinned.files = hashes;
  pinned.sizes = sizes;
  await writeFile(join(target, "LICENSE.txt"), engine.license(installed));
  console.log(`${id} ${installed} → ${target}`);
}
if (update)
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
