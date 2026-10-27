/** Explicit synthetic ENG-375 browser catalog. Never reads/writes the managed catalog copy. */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { revisionId } from "../../packages/content/revision";
import { validateCopy } from "../../packages/content/copy";
import type { Catalog, Revision } from "../../packages/content/model";
import type { ChallengeSource } from "../../packages/content/source";
const root = fileURLToPath(new URL("../../", import.meta.url));
const catalog: Catalog = {
  schemaVersion: "1.0.0",
  challenges: [],
  revisions: {},
};
const sources: ChallengeSource[] = [];
for (const key of ["JS-900", "JS-901"]) {
  const revision: Revision = {
    challenge: key,
    task: "**SYNTHETIC QA FIXTURE — no participant or benchmark solution.**\n\nReturn the supplied value. Public example: 2 → 2. Additional check: 3 → 3.",
    language: "javascript",
    file: "fixture.js",
    starter: "export function fixture(value) {\n  return null;\n}\n",
    entrypoint: "fixture",
    cases: [
      { id: "example", input: 2, expected: 2, hidden: false },
      { id: "additional", input: 3, expected: 3, hidden: true },
    ],
    rules: [],
  };
  const metadata = {
    key,
    title: "SYNTHETIC QA · Return a value",
    summary: "Synthetic output-first fixture",
    difficulty: "easy" as const,
    tags: ["synthetic-qa"],
  };
  const id = revisionId(revision);
  // Catalog types are readonly; construction stays local to this explicit fixture.
  (catalog.challenges as any[]).push({ ...metadata, revision: id });
  (catalog.revisions as Record<string, Revision>)[id] = revision;
  sources.push({
    metadata,
    revision,
    private: {
      solution: "export function fixture(value) { return value; }",
      alternatives: [],
      wrong: [],
      examples: {},
    },
  });
}
const copy = validateCopy({
  schemaVersion: "managed-catalog-copy-1",
  exportedAt: "2026-10-27T00:00:00Z",
  catalog,
  archives: catalog.revisions,
  sources,
});
const directory = resolve(root, ".local/eng375-synthetic");
mkdirSync(directory, { recursive: true, mode: 0o700 });
writeFileSync(resolve(directory, "catalog-copy.json"), JSON.stringify(copy), {
  mode: 0o600,
});
console.log(
  "Synthetic QA only: .local/eng375-synthetic/catalog-copy.json (select explicitly with MM_CATALOG_COPY). No managed copy was changed.",
);
