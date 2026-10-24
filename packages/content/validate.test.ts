import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Revision } from "./model";
import { validateRevision } from "./validate";

const catalog = JSON.parse(
  readFileSync(new URL("../../content/catalog.json", import.meta.url), "utf8"),
);
const revisionOf = (issue: string): Revision => {
  const meta = catalog.issues.find((i: { id: string }) => i.id === issue);
  return catalog.revisions[meta.revision];
};

test("a workspace may have several editable files and read-only sources, if its runner loads them", () => {
  const js = revisionOf("format-price");
  const multi: Revision = {
    ...js,
    workspace: {
      ...js.workspace,
      files: {
        ...js.workspace.files,
        "src/money.js": { role: "read", language: "javascript", text: "export const x = 1;\n" },
        "src/other.js": { role: "edit", language: "javascript", text: "\n" },
      },
    },
  };
  validateRevision(multi, "js");
  // Python's runner loads one file, so a second source file is refused.
  const py = revisionOf("frequency-map");
  assert.throws(
    () =>
      validateRevision(
        {
          ...py,
          workspace: {
            ...py.workspace,
            files: {
              ...py.workspace.files,
              "helpers.py": { role: "read", language: "python", text: "\n" },
            },
          },
        },
        "py",
      ),
    /cannot load more than one source file/,
  );
});

test("the entry must be a source file, and something must be editable", () => {
  const js = revisionOf("format-price");
  assert.throws(
    () => validateRevision({ ...js, workspace: { ...js.workspace, entry: "README.md" } }, "x"),
    /entry README.md is not one of its source files/,
  );
  const readOnly = Object.fromEntries(
    Object.entries(js.workspace.files).map(([p, f]) => [
      p,
      f.role === "edit" ? { ...f, role: "read" as const } : f,
    ]),
  );
  assert.throws(
    () => validateRevision({ ...js, workspace: { ...js.workspace, files: readOnly } }, "x"),
    /at least one editable file/,
  );
});
