/** Public synthetic examples only: no real challenge answers or private cases. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCopy } from "./copy";
import { revisionId } from "./revision";
import type { Revision } from "./model";
const revision: Revision = {
  challenge: "JS-900",
  task: "Synthetic loader fixture: return the supplied value.",
  language: "javascript",
  file: "fixture.js",
  starter: "export function fixture(value) { return null; }",
  entrypoint: "fixture",
  cases: [{ id: "case-1", input: 1, expected: 1, hidden: false }],
  rules: [],
};
const id = revisionId(revision);
const metadata = {
  key: "JS-900",
  title: "Synthetic loader fixture",
  summary: "Tests loading only.",
  difficulty: "easy" as const,
  tags: ["synthetic-qa"],
};
const copy = () => ({
  schemaVersion: "managed-catalog-copy-1",
  exportedAt: "2026-10-27T00:00:00Z",
  catalog: {
    schemaVersion: "1.0.0",
    challenges: [{ ...metadata, revision: id }],
    revisions: { [id]: revision },
  },
  archives: { [id]: revision },
  sources: [
    {
      metadata,
      revision,
      private: {
        solution: "export function fixture(value) { return value; }",
        alternatives: [],
        wrong: [],
        examples: {},
      },
    },
  ],
});
test("synthetic managed copy keeps private QA outside the public catalog projection", () => {
  const got = validateCopy(copy());
  assert.equal(got.sources.length, 1);
  assert.equal(JSON.stringify(got.catalog).includes("return value;"), false);
  assert.equal(got.sources[0].private.solution.includes("return value;"), true);
});
test("missing archives and stale private sources fail closed", () => {
  const missing = copy();
  missing.archives = {};
  assert.throws(() => validateCopy(missing));
  const stale = copy();
  stale.sources[0].revision = { ...revision, starter: "changed" };
  assert.throws(() => validateCopy(stale));
});
test("altered archive hashes and duplicate or unrecognized source fields fail closed", () => {
  const bad = copy();
  bad.archives[id] = { ...revision, starter: "changed" };
  assert.throws(() => validateCopy(bad));
  const duplicate = copy();
  duplicate.sources.push(duplicate.sources[0]);
  assert.throws(() => validateCopy(duplicate));
  const unknown = copy();
  (unknown.sources[0] as any).publicSecret = "synthetic";
  assert.throws(() => validateCopy(unknown));
});
test("no repository folder or embedded fixture fallback is used when a copy is absent", async () => {
  const { readCatalogCopy } = await import("./copy");
  assert.throws(
    () => readCatalogCopy("/tmp/mm-eng371-no-catalog-here"),
    /no repository fallback/,
  );
});
