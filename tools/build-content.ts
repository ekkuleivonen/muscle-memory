/** Public build projection of an authorized, gitignored managed catalog copy. No private QA is bundled. */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readCatalogCopy } from "../packages/content/copy";
const root = fileURLToPath(new URL("../", import.meta.url));
const copy = readCatalogCopy(root);
if (!process.argv.includes("--dry-run")) {
  await mkdir(new URL("../content/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../content/catalog.json", import.meta.url),
    JSON.stringify(copy.catalog) + "\n",
  );
}
console.log(
  `Verified ${copy.catalog.challenges.length} managed challenges and ${Object.keys(copy.archives).length} revisions; private QA excluded from public projection.`,
);
