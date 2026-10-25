import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Catalog, Revision } from "./model";
import { validateCatalog, validateRevision } from "./validate";

const catalog: Catalog = JSON.parse(
  readFileSync(new URL("../../content/catalog.json", import.meta.url), "utf8"),
);
const revisionOf = (id: string): Revision =>
  catalog.revisions[catalog.challenges.find((c) => c.id === id)!.revision];

test("the catalog as built is valid", () => {
  assert.equal(validateCatalog(catalog), catalog);
});

test("read-only sources are allowed when the runner loads several files", () => {
  const js = revisionOf("format-price");
  validateRevision(
    {
      ...js,
      workspace: {
        ...js.workspace,
        files: {
          ...js.workspace.files,
          "src/money.js": { role: "read", language: "javascript", text: "export const x = 1;\n" },
        },
      },
    },
    "js",
  );
  // Go's runner loads one file, so a second source file is refused.
  const go = revisionOf("pagination-params");
  assert.throws(
    () =>
      validateRevision(
        {
          ...go,
          workspace: {
            ...go.workspace,
            files: {
              ...go.workspace.files,
              "internal/helpers.go": { role: "read", language: "go", text: "package main\n" },
            },
          },
        },
        "go",
      ),
    /cannot load more than one source file/,
  );
});

test("the entry is the one editable file", () => {
  const js = revisionOf("format-price");
  const second = {
    ...js,
    workspace: {
      ...js.workspace,
      files: {
        ...js.workspace.files,
        "src/other.js": { role: "edit" as const, language: "javascript", text: "\n" },
      },
    },
  };
  assert.throws(() => validateRevision(second, "x"), /must be the one editable file/);
  const readOnly = Object.fromEntries(
    Object.entries(js.workspace.files).map(([p, f]) => [p, { ...f, role: "read" as const }]),
  );
  assert.throws(
    () => validateRevision({ ...js, workspace: { ...js.workspace, files: readOnly } }, "x"),
    /must be the one editable file/,
  );
});

test("a rule needs a message and a trigger read from the code", () => {
  const js = revisionOf("format-price");
  const withRule = (rule: unknown) =>
    ({ ...js, checks: { ...js.checks, rules: [rule] } }) as Revision;
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
