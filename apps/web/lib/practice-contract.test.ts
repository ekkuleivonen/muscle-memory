import { test } from "node:test";
import assert from "node:assert/strict";
import { catalog } from "./test-fixtures";
import {
  supportsOneFilePractice,
  incompatibleSavedPaths,
} from "./practice-contract";

test("every supported live challenge has one editable entry and no hint/comment dependence, including SQL", () => {
  const languages = new Set<string>();
  for (const issue of catalog.issues) {
    const revision = catalog.revisions[issue.revision];
    assert.equal(supportsOneFilePractice(revision), true, issue.id);
    languages.add(revision.workspace.language);
  }
  assert.ok(languages.has("sql"));
  assert.ok(languages.has("python"));
  assert.ok(languages.has("javascript"));
});

test("historical bundles are not normalized by hiding required files or hint/comment requirements", () => {
  const current = catalog.revisions[catalog.issues[0].revision];
  assert.equal(
    supportsOneFilePractice({
      ...current,
      workspace: {
        ...current.workspace,
        files: {
          ...current.workspace.files,
          "another.js": { role: "edit", language: "javascript", text: "" },
        },
      },
    }),
    false,
  );
  assert.equal(
    supportsOneFilePractice({ ...current, hints: [{ id: "old-hint" } as any] }),
    false,
  );
  assert.equal(
    supportsOneFilePractice({
      ...current,
      team: [{ where: "issue", severity: "info" } as any],
    }),
    false,
  );
  assert.ok(
    Object.values(catalog.revisions).some((r) => !supportsOneFilePractice(r)),
    "historical bundles remain intact",
  );
  assert.deepEqual(
    incompatibleSavedPaths(current, {
      [current.workspace.entry]: "saved",
      "other.py": "keep this",
    }),
    ["other.py"],
  );
});
