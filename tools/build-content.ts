/**
 * Builds content/catalog.json from content/seed.ts: each challenge's files are laid out here,
 * at authoring time, and its revision is stored under the SHA-256 of its content. A challenge
 * with a private part must pass the publish checks that need no code to run
 * (packages/content/publish); the private part itself is never written out.
 *
 *   node --import tsx tools/build-content.ts           write the catalog
 *   node --import tsx tools/build-content.ts --check   fail if it is out of date
 *   node --import tsx tools/build-content.ts --dry-run run every check, write nothing
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { entryPath } from "../apps/web/lib/entry";
import type { LanguageId } from "../apps/web/lib/languages";
import type { Json } from "../packages/domain/json";
import type { Catalog, ChallengeMetadata, Revision } from "../packages/content/model";
import { publishProblems } from "../packages/content/publish";
import { revisionId, verifyCatalog } from "../packages/content/revision";
import { SEED_ISSUES, type SeedIssue } from "../content/seed";

const destination = resolve("content/catalog.json");
const check = process.argv.includes("--check");
const dryRun = process.argv.includes("--dry-run");

function revisionOf(seed: SeedIssue): Revision {
  const cases = seed.inputs.map((input, index) => ({
    id: `case-${index + 1}`,
    ...(seed.names?.[index] ? { name: seed.names[index] } : {}),
    input: input as Json,
    expected: seed.expected[index] as Json,
    // Cases listed in `hidden` are not examples: only Submit runs them.
    visible: !seed.hidden?.includes(index),
  }));
  if (seed.entry && !["javascript", "typescript", "python"].includes(seed.language))
    throw new Error(`${seed.id}: only JavaScript, TypeScript and Python challenges can place their entry file.`);
  const entry = entryPath({
    slug: seed.id,
    language: seed.language as LanguageId,
    entrypoint: seed.entrypoint,
    starter: seed.starter,
    entry: seed.entry,
  });
  const files = [
    { path: entry, role: "edit" as const, language: seed.language, text: seed.starter },
    ...(seed.files ?? []),
  ].sort((a, b) => a.path.localeCompare(b.path));
  return {
    challenge: seed.id,
    body: seed.task,
    workspace: {
      language: seed.language,
      files: Object.fromEntries(
        files.map((f) => [f.path, { role: f.role, language: f.language, text: f.text }]),
      ),
      entry,
      entrypoint: seed.entrypoint,
      ...(seed.parameters ? { parameters: seed.parameters } : {}),
      ...(seed.schema ? { schema: seed.schema } : {}),
      ...(seed.adapter ? { adapter: seed.adapter } : {}),
    },
    checks: { cases, rules: seed.rules ?? [] },
  };
}

const revisions: Record<string, Revision> = {};
const challenges: ChallengeMetadata[] = [];
// Every challenge's problems, so one run lists them all.
const blocked: string[] = [];
for (const seed of SEED_ISSUES) {
  const revision = revisionOf(seed);
  if (seed.private) {
    const problems = publishProblems(revision, seed.private);
    if (problems.length) blocked.push(`${seed.id} cannot be published:\n  ${problems.join("\n  ")}`);
  }
  const id = revisionId(revision);
  revisions[id] = revision;
  challenges.push({
    id: seed.id,
    key: seed.key,
    title: seed.title,
    summary: seed.summary,
    difficulty: seed.difficulty,
    tags: seed.tags,
    revision: id,
  });
}
if (blocked.length) throw new Error(blocked.join("\n"));

const byKey = (a: ChallengeMetadata, b: ChallengeMetadata) =>
  a.key.localeCompare(b.key, "en", { numeric: true });
const catalog: Catalog = verifyCatalog({
  schemaVersion: "1.0.0",
  // Sorted, so the file only changes where content does.
  challenges: challenges.sort(byKey),
  revisions: Object.fromEntries(Object.entries(revisions).sort(([a], [b]) => a.localeCompare(b))),
});
const text = JSON.stringify(catalog, null, 2) + "\n";
if (check) {
  if ((await readFile(destination, "utf8").catch(() => "")) !== text)
    throw new Error("content/catalog.json is out of date. Run npm run build:content.");
  console.log("Content catalog is current.");
} else if (dryRun) {
  console.log(`Checked ${challenges.length} challenges; nothing written.`);
} else {
  await writeFile(destination, text);
  console.log(`Wrote ${challenges.length} challenges.`);
}
