/**
 * Copies the pinned Pyodide files from node_modules into the app's static assets and
 * verifies each against runtime-manifest.json. No network access; fails closed on mismatch.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(join(root, "packages/runner/runtime-manifest.json"), "utf8"),
);
const require = createRequire(join(root, "apps/web/package.json"));
const source = dirname(require.resolve("pyodide/package.json"));
const installed = JSON.parse(
  await readFile(join(source, "package.json"), "utf8"),
);
if (installed.version !== manifest.version)
  throw new Error(
    `Installed pyodide ${installed.version} does not match pinned ${manifest.version}.`,
  );
const target = join(root, "apps/web/public", manifest.basePath);
await mkdir(target, { recursive: true });
for (const [name, integrity] of Object.entries(manifest.files)) {
  const bytes = await readFile(join(source, name));
  const actual =
    "sha256-" + createHash("sha256").update(bytes).digest("base64");
  if (actual !== integrity)
    throw new Error(
      `${name} hash ${actual} does not match pinned ${integrity}.`,
    );
  await writeFile(join(target, name), bytes);
}
await writeFile(
  join(target, "LICENSE.txt"),
  `Pyodide ${manifest.version} (MPL-2.0), https://github.com/pyodide/pyodide\n`,
);
console.log(`Python runtime ${manifest.version} copied to ${target}`);
