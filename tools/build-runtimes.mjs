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
import { gzipSync } from "node:zlib";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

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

async function bundle(source, define = {}) {
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

const integrity = (bytes) =>
  "sha256-" + createHash("sha256").update(bytes).digest("base64");

for (const [id, engine] of Object.entries(ENGINES)) {
  const pinned = manifest[id];
  const installed = await versionOf(engine.package);
  if (installed !== pinned.version) {
    if (!update)
      throw new Error(
        `Installed ${engine.package} ${installed} does not match pinned ${pinned.version}. Run with --update after an upgrade.`,
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
