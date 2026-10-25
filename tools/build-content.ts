/**
 * Builds content/catalog.json from content/challenges (packages/content/source.ts): every
 * challenge's metadata and its revision, stored under the SHA-256 of its content. Each must
 * pass the publish checks that need no code to run (packages/content/publish.ts); the private
 * part is never written out. The catalog is a build output: dev, build and tests make it.
 *
 *   node --import tsx tools/build-content.ts           write the catalog
 *   node --import tsx tools/build-content.ts --dry-run run every check, write nothing
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Catalog, ChallengeMetadata, Revision } from "../packages/content/model";
import { publishProblems } from "../packages/content/publish";
import { revisionId, verifyCatalog } from "../packages/content/revision";
import { readChallenges } from "../packages/content/source";

const content = (path: string) => fileURLToPath(new URL(`../content/${path}`, import.meta.url));
const destination = content("catalog.json");
const dryRun = process.argv.includes("--dry-run");

const revisions: Record<string, Revision> = {};
const challenges: ChallengeMetadata[] = [];
// Every challenge's problems, so one run lists them all.
const blocked: string[] = [];
for (const source of readChallenges(content("challenges"))) {
  const problems = publishProblems(source.revision, source.private);
  if (problems.length)
    blocked.push(`${source.metadata.key} cannot be published:\n  ${problems.join("\n  ")}`);
  const id = revisionId(source.revision);
  revisions[id] = source.revision;
  challenges.push({ ...source.metadata, revision: id });
}
if (blocked.length) throw new Error(blocked.join("\n"));

const catalog: Catalog = verifyCatalog({
  schemaVersion: "1.0.0",
  challenges,
  // Sorted, so the same content always gives the same file.
  revisions: Object.fromEntries(Object.entries(revisions).sort(([a], [b]) => a.localeCompare(b))),
});
if (dryRun) console.log(`Checked ${challenges.length} challenges; nothing written.`);
else {
  await writeFile(destination, JSON.stringify(catalog, null, 2) + "\n");
  console.log(`Wrote ${challenges.length} challenges.`);
}
