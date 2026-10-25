import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_ISSUES } from "../../content/seed";
import type { Catalog, Revision } from "./model";
import { publishProblems, type Private } from "./publish";

const catalog: Catalog = JSON.parse(
  readFileSync(new URL("../../content/catalog.json", import.meta.url), "utf8"),
);
const revisionOf = (id: string): Revision =>
  catalog.revisions[catalog.challenges.find((c) => c.id === id)!.revision];
const privateOf = (id: string): Private => SEED_ISSUES.find((s) => s.id === id)!.private!;

test("every seed challenge with a private part passes the publish checks", () => {
  const checked = SEED_ISSUES.filter((s) => s.private);
  assert.ok(checked.length >= 2);
  for (const seed of checked)
    assert.deepEqual(publishProblems(revisionOf(seed.id), seed.private!), [], seed.id);
});

test("a rule needs examples both ways, and must not fire on a correct solution", () => {
  const revision = revisionOf("refund-totals");
  const secret = privateOf("refund-totals");
  const [id] = revision.checks.rules.map((r) => r.id);
  const { [id]: _, ...others } = secret.examples!;
  assert.deepEqual(publishProblems(revision, { ...secret, examples: others }), [
    `rule ${id} needs examples that fire it and that do not`,
  ]);
  const scope = secret.examples![id].fires[0];
  assert.deepEqual(
    publishProblems(revision, {
      ...secret,
      reference: scope,
      examples: { ...secret.examples, [id]: { fires: [scope], quiet: [scope] } },
    }),
    [`${id}: quiet example 1 fires it`, `rule ${id} fires on the reference solution`],
  );
});

test("JavaScript and Python challenges show their checks accept other designs and catch mistakes", () => {
  const revision = revisionOf("frequency-map");
  const secret = privateOf("frequency-map");
  assert.deepEqual(publishProblems(revision, { ...secret, alternatives: [], wrong: [] }), [
    "no alternative: name another correct design the checks accept",
    "fewer than two wrong solutions: name plausible mistakes the checks must catch",
  ]);
});

test("the reference must change the editable file, and only it", () => {
  const revision = revisionOf("frequency-map");
  const secret = privateOf("frequency-map");
  const starter = revision.workspace.files[revision.workspace.entry].text;
  assert.deepEqual(
    publishProblems(revision, { ...secret, reference: { [revision.workspace.entry]: starter } }),
    ["the reference is the starter unchanged"],
  );
  assert.ok(
    publishProblems(revision, { ...secret, reference: { "other.py": "x" } }).includes(
      "the reference changes other.py, which is not editable",
    ),
  );
});
