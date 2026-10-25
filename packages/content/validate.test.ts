import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Catalog, Revision } from "./model";
import { validateCatalog, validateRevision } from "./validate";

const catalog: Catalog = JSON.parse(
  readFileSync(new URL("../../content/catalog.json", import.meta.url), "utf8"),
);
const revisionOf = (key: string): Revision =>
  catalog.revisions[catalog.challenges.find((c) => c.key === key)!.revision];

test("the catalog as built is valid", () => {
  assert.equal(validateCatalog(catalog), catalog);
});

test("a revision names its challenge by a key that fits its language", () => {
  const js = revisionOf("JS-003");
  validateRevision(js, "js");
  assert.throws(() => validateRevision({ ...js, challenge: "PY-003" }, "x"), /should start with JS-/);
  assert.throws(() => validateRevision({ ...js, challenge: "format-price" }, "x"), /not CODE-NNN/);
});

test("the file name is safe, and there is at least one example", () => {
  const js = revisionOf("JS-003");
  assert.throws(() => validateRevision({ ...js, file: "../escape.js" }, "x"), /unsafe file name/);
  assert.throws(
    () => validateRevision({ ...js, cases: js.cases.map((c) => ({ ...c, hidden: true })) }, "x"),
    /needs at least one example/,
  );
});

test("a rule needs a message and a trigger read from the code", () => {
  const js = revisionOf("JS-003");
  const withRule = (rule: unknown) => ({ ...js, rules: [rule] }) as Revision;
  validateRevision(
    withRule({ id: "cents", message: "Keep money in cents.", when: { pattern: "toFixed", present: true } }),
    "x",
  );
  assert.throws(
    () => validateRevision(withRule({ id: "cents", message: "", when: { pattern: "x", present: true } }), "x"),
    /needs text/,
  );
  assert.throws(
    () => validateRevision(withRule({ id: "late", message: "Hurry.", when: { behaviour: "slow" } }), "x"),
    /unknown trigger/,
  );
});
