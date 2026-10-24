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
  catalog.revisions[catalog.issues.find((i) => i.id === id)!.revision];
const privateOf = (id: string): Private => SEED_ISSUES.find((s) => s.id === id)!.private!;

test("every seed issue with a private part passes the publish checks", () => {
  const checked = SEED_ISSUES.filter((s) => s.private);
  assert.ok(checked.length >= 2);
  for (const seed of checked)
    assert.deepEqual(publishProblems(revisionOf(seed.id), seed.private!), [], seed.id);
});

test("a blocking comment needs examples both ways, and must not block the reference", () => {
  const revision = revisionOf("refund-totals");
  const secret = privateOf("refund-totals");
  const { ["ada-abs"]: _, ...others } = secret.examples!;
  assert.deepEqual(publishProblems(revision, { ...secret, examples: others }), [
    "blocking comment ada-abs needs examples that fire it and that do not",
  ]);
  const abs = secret.examples!["ada-abs"].fires[0];
  assert.deepEqual(
    publishProblems(revision, {
      ...secret,
      reference: abs,
      examples: { ...secret.examples, "ada-abs": { fires: [abs], quiet: [abs] } },
    }),
    ["ada-abs: quiet example 1 fires it", "blocking comment ada-abs fires on the reference solution"],
  );
});

test("examples must do what they claim, and hints must not hold the fix", () => {
  const revision = revisionOf("frequency-map");
  const secret = privateOf("frequency-map");
  const clean = secret.reference;
  assert.deepEqual(
    publishProblems(revision, {
      ...secret,
      examples: { "priya-debug-print": { fires: [clean], quiet: [clean] } },
    }),
    ["priya-debug-print: example 1 should fire it"],
  );
  const leaky: Revision = {
    ...revision,
    hints: [{ ...revision.hints[0], text: "Use counts[item] = counts.get(item, 0) + 1 in the loop." }],
  };
  assert.deepEqual(publishProblems(leaky, secret), [
    "hint hint-1 gives away the reference: counts[item] = counts.get(item, 0) + 1",
  ]);
  assert.deepEqual(
    publishProblems(revision, { ...secret, reference: { "nowhere.py": "x = 1\n" } }),
    ["the reference changes nowhere.py, which is not editable"],
  );
});
