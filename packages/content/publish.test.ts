import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_ISSUES } from "../../content/seed";
import type { Catalog, Revision } from "./model";
import { continuityProblems, publishProblems, type Private } from "./publish";

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

test("a blocking comment needs examples both ways, and must not block a correct fix", () => {
  const revision = revisionOf("refund-totals");
  const secret = privateOf("refund-totals");
  const { ["ada-order-total"]: _, ...others } = secret.examples!;
  assert.deepEqual(publishProblems(revision, { ...secret, examples: others }), [
    "blocking comment ada-order-total needs examples that fire it and that do not",
  ]);
  const scope = secret.examples!["ada-order-total"].fires[0];
  assert.deepEqual(
    publishProblems(revision, {
      ...secret,
      reference: scope,
      examples: { ...secret.examples, "ada-order-total": { fires: [scope], quiet: [scope] } },
    }),
    [
      "ada-order-total: quiet example 1 fires it",
      "blocking comment ada-order-total fires on the reference solution",
    ],
  );
  // Another correct design must be mergeable too, not only the one the author wrote.
  assert.deepEqual(
    publishProblems(revision, { ...secret, alternatives: [...secret.alternatives!, scope] }),
    ["blocking comment ada-order-total fires on alternative 4"],
  );
});

test("JavaScript and Python issues show their checks accept other designs and catch mistakes", () => {
  const revision = revisionOf("refund-totals");
  const secret = privateOf("refund-totals");
  assert.deepEqual(
    publishProblems(revision, { ...secret, alternatives: [], wrong: secret.wrong!.slice(0, 1) }),
    [
      "no alternative: name another correct design the checks accept",
      "fewer than two wrong fixes: name plausible mistakes the checks must catch",
    ],
  );
});

test("a new revision may add editable files, never take one away or rename the entry point", () => {
  const revision = revisionOf("refund-totals");
  const files = revision.workspace.files;
  const readOnly: Revision = {
    ...revision,
    workspace: {
      ...revision.workspace,
      files: { ...files, "src/cart/totals.js": { ...files["src/cart/totals.js"], role: "read" } },
    },
  };
  assert.deepEqual(continuityProblems(revision, readOnly), [
    "src/cart/totals.js was editable in the live revision and no longer is",
  ]);
  const moreEditable: Revision = {
    ...revision,
    workspace: {
      ...revision.workspace,
      files: { ...files, "src/cart/money.js": { ...files["src/cart/money.js"], role: "edit" } },
    },
  };
  assert.deepEqual(continuityProblems(revision, moreEditable), []);
  assert.deepEqual(
    continuityProblems(revision, {
      ...revision,
      workspace: { ...revision.workspace, entrypoint: "refund" },
    }),
    ["the entry point changed from refundTotal"],
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
  // Hints are no longer published at all; one that gives the fix away is still named as such.
  const leaky: Revision = {
    ...revision,
    hints: [
      {
        id: "hint-1",
        level: 1,
        author: { name: "Lena M", role: "Product" },
        text: "Use counts[item] = counts.get(item, 0) + 1 in the loop.",
        when: { behaviour: "active-minutes-without-progress", atLeast: 10 },
      },
    ],
  };
  assert.deepEqual(publishProblems(leaky, secret), [
    "hints are not published: put what is required in the description",
    "hint hint-1 gives away the reference: counts[item] = counts.get(item, 0) + 1",
  ]);
  assert.deepEqual(
    publishProblems(revision, { ...secret, reference: { "nowhere.py": "x = 1\n" } }),
    ["the reference changes nowhere.py, which is not editable"],
  );
});

test("single file: the entry is the only editable file, and only blocking rules are published", () => {
  const revision = revisionOf("refund-totals");
  const secret = privateOf("refund-totals");
  const { entry, files } = revision.workspace;
  assert.deepEqual(
    Object.entries(files)
      .filter(([, f]) => f.role === "edit")
      .map(([path]) => path),
    [entry],
  );
  const support = Object.keys(files).find((p) => files[p].role === "read")!;
  const twoFiles: Revision = {
    ...revision,
    workspace: {
      ...revision.workspace,
      files: { ...files, [support]: { ...files[support], role: "edit" } },
    },
  };
  assert.deepEqual(publishProblems(twoFiles, secret), [
    `${support} is editable, but only the entry ${entry} may be`,
  ]);
  const rule = revision.team.find((c) => c.severity === "blocking")!;
  const chatty: Revision = {
    ...revision,
    team: [...revision.team, { ...rule, id: "a-nit", severity: "nit" }],
  };
  assert.deepEqual(publishProblems(chatty, secret), [
    "comment a-nit is not a blocking rule: put what is required in the description",
  ]);
});

test("every live revision is single-file: one editable entry, no hints, only blocking rules", () => {
  for (const issue of catalog.issues) {
    const revision = catalog.revisions[issue.revision];
    const editable = Object.entries(revision.workspace.files).filter(
      ([, f]) => f.role === "edit",
    );
    assert.deepEqual(
      editable.map(([p]) => p),
      [revision.workspace.entry],
      issue.id,
    );
    assert.equal(revision.hints.length, 0, issue.id);
    assert.ok(
      revision.team.every((c) => c.severity === "blocking" && !c.resolve),
      issue.id,
    );
    assert.equal(revision.ciFindings, undefined, issue.id);
  }
});

test("collapsing to the single editable entry keeps saved entry code; nothing else may drop files", () => {
  const before = JSON.parse(
    readFileSync(
      new URL(
        "../../apps/web/lib/pre-single-file-revisions.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as Record<string, string>;
  // FN-3 had two editable files; its live revision keeps only the entry, same path and function.
  const previous = catalog.revisions[before["length-report-inches"]];
  const live = revisionOf("length-report-inches");
  assert.ok(previous.workspace.files["notebook/units.py"]?.role === "edit");
  assert.deepEqual(continuityProblems(previous, live), []);
  // Moving the entry, or keeping two editable files while dropping one, still strands work.
  assert.deepEqual(
    continuityProblems(previous, {
      ...live,
      workspace: { ...live.workspace, entry: "notebook/units.py" },
    }),
    ["notebook/units.py was editable in the live revision and no longer is"],
  );
});
