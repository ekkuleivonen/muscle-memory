import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { library, summarize } from "./library";
import {
  filterByMarks,
  filterIssues,
  formatQuery,
  parseIssueQuery,
  toggle,
} from "./queries";
import { continuityProblems } from "../../../packages/content/publish";
import { catalog } from "./test-fixtures";

const merged = library(catalog);

test("unlisted exercises remain addressable in personal history but not discovery", () => {
  assert.equal(
    merged.issues.some((i) => i.key === "JS-002"),
    false,
  );
  assert.equal(
    merged.allIssues.find((i) => i.key === "JS-002")?.language,
    "javascript",
  );
  assert.equal(
    merged.allIssues.find((i) => i.key === "JS-002")?.slug,
    merged.findIssue("JS-002")?.slug,
  );
});

test("issues are live metadata over their live revisions, grouped into projects", () => {
  const issue = merged.findIssue("PY-002")!;
  const meta = catalog.issues.find((i) => i.id === "frequency-map")!;
  assert.deepEqual(
    [issue.slug, issue.revision, issue.runnable, issue.kind],
    ["frequency-map", meta.revision, true, "feature"],
  );
  assert.equal(issue.title, "Nightly vial tally is empty");
  assert.deepEqual(issue.project, {
    slug: "field-notes",
    title: "Field notes",
    key: "FN",
    hue: issue.project.hue,
  });
  assert.deepEqual(issue.criteria[1], { input: [], expected: {} });
  // Live revisions carry no ticket thread: what is required is in the description (ENG-329).
  assert.deepEqual(issue.comments, []);
  assert.deepEqual(
    merged.projects.map((p) => [p.slug, p.issues.length]),
    [
      ["incident-response", 1],
      ["field-notes", 5],
      ["storefront", 8],
      ["accounts-api", 9],
      ["data-platform", 8],
      ["edge-proxy", 7],
    ],
  );
});

test("retired issues leave lists, but every published revision still resolves", () => {
  const meta = catalog.issues.find((i) => i.id === "lru-cache")!;
  const retired = library({
    ...catalog,
    issues: catalog.issues.map((i) =>
      i.id === "lru-cache" ? { ...i, state: "retired" as const } : i,
    ),
  });
  assert.equal(retired.findIssue("CPP-001"), undefined);
  assert.deepEqual(
    retired.findProject("EDGE")!.issues.map((i) => i.key),
    ["C-002", "GO-006", "GO-004", "C-001", "GO-007", "CPP-002"],
  );
  // Recorded work names the revision it ran against; it stays readable.
  assert.equal(retired.revision(meta.revision)?.issue, "lru-cache");
  // Every revision it ever had, the live one and the earlier ones recorded work may name.
  const own = Object.keys(catalog.revisions).filter(
    (id) => catalog.revisions[id].issue === "lru-cache",
  );
  assert.ok(own.includes(meta.revision) && own.length > 1);
  assert.deepEqual(
    Object.keys(retired.revisionsOf("lru-cache")).sort(),
    own.sort(),
  );
});

test("issues run when their language has an engine", () => {
  // Every seed issue's language has an engine, with what that engine needs.
  assert.equal(merged.issues.length, 38);
  assert.ok(merged.issues.every((i) => i.runnable));
});

test("issue keys are the catalog's: the language's code and a number", () => {
  const keys = Object.fromEntries(merged.issues.map((i) => [i.slug, i.key]));
  assert.equal(keys["frequency-map"], "PY-002");
  assert.equal(keys["parse-log-line"], "GO-003");
  assert.equal(keys["lru-cache"], "CPP-001");
  assert.deepEqual(
    merged.projects.map((c) => c.key),
    ["INC", "FN", "SHOP", "API", "DATA", "EDGE"],
  );
  assert.ok(merged.projects.every((c) => c.hue >= 0 && c.hue < 8));
});

test("qualifiers parse into filters; unknown ones stay as text", () => {
  const query = parseIssueQuery(
    'kind:bug,BUG lang:python,klingon is:runnable sort:title label:maps "log parser" colour:red',
  );
  assert.deepEqual(query.kind, ["bug"]);
  assert.deepEqual(query.language, ["python"]);
  assert.deepEqual(query.label, ["maps"]);
  assert.equal(query.sort, "title");
  assert.deepEqual(query.text, ["log parser", "colour:red"]);
  assert.equal(
    formatQuery(query),
    // is:runnable from older links is dropped: every issue runs.
    'kind:bug lang:python label:maps sort:title "log parser" colour:red',
  );
  assert.equal(parseIssueQuery("x".repeat(500)).text[0].length, 200);
  // Projects are not a search term any more: project: reads as plain text.
  assert.deepEqual(parseIssueQuery("project:shop").text, ["project:shop"]);
});

test("filters combine across qualifiers and match any value within one", () => {
  const keys = (q: string) =>
    filterIssues(merged.issues, parseIssueQuery(q)).map((i) => i.key);
  assert.deepEqual(keys("kind:bug"), [
    "C-001",
    "CPP-001",
    "CPP-002",
    "CS-002",
    "GO-002",
    "GO-003",
    "JAVA-002",
    "JS-001",
    "JS-003",
    "JS-005",
    "JS-006",
    "PHP-002",
    "PHP-003",
    "PY-004",
    "PY-005",
    "PY-006",
    "PY-008",
    "PY-010",
    "RB-002",
    "SQL-002",
    "TS-002",
    "TS-005",
    "TS-006",
  ]);
  assert.deepEqual(keys("kind:bug lang:go"), ["GO-002", "GO-003"]);
  assert.deepEqual(keys("lang:rust,go"), [
    "GO-002",
    "GO-003",
    "GO-004",
    "GO-005",
    "GO-006",
    "GO-007",
  ]);
  // Every issue runs, and an old is:runnable link still shows them all.
  assert.equal(keys("is:runnable").length, merged.issues.length);
  assert.deepEqual(keys("label:strings"), [
    "C-001",
    "GO-003",
    "GO-005",
    "JAVA-002",
    "JS-003",
    "PY-003",
    "PY-004",
    "RB-002",
    "TS-002",
  ]);
  assert.deepEqual(keys("GO-003"), ["GO-003"]);
  assert.deepEqual(keys("parser"), ["GO-003"]);
  assert.deepEqual(keys("rust hard"), []);
  // Natural key order by default; difficulty and title on request.
  assert.deepEqual(keys("lang:go"), [
    "GO-002",
    "GO-003",
    "GO-004",
    "GO-005",
    "GO-006",
    "GO-007",
  ]);
  assert.equal(keys("sort:difficulty")[0], "C-001");
  assert.equal(keys("sort:difficulty").at(-1), "TS-006");
});

test("toggles switch one value and round-trip through the search line", () => {
  const query = parseIssueQuery("kind:bug log");
  const on = toggle(query, "language", "go");
  assert.equal(formatQuery(on), "kind:bug lang:go log");
  assert.equal(formatQuery(toggle(on, "language", "go")), "kind:bug log");
  assert.deepEqual(parseIssueQuery(formatQuery(on)), on);
});

test("issues are found by permanent key, in any case, or by their id", () => {
  const lru = merged.findIssue("CPP-001")!;
  assert.equal(lru.slug, "lru-cache");
  assert.equal(merged.findIssue("cpp-001"), lru);
  assert.equal(merged.findIssue("lru-cache"), lru);
  assert.equal(merged.findIssue("CPP-099"), undefined);
});

test("projects are found by unique key, in any case, or by their id", () => {
  const edge = merged.findProject("EDGE")!;
  assert.equal(edge.slug, "edge-proxy");
  assert.equal(merged.findProject("edge"), edge);
  assert.equal(merged.findProject("edge-proxy"), edge);
  assert.equal(merged.findProject("NOPE"), undefined);
  const keys = merged.projects.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("keys are stored, not derived from list position", () => {
  // Reordering a project must not renumber its issues.
  const reordered = library({
    ...catalog,
    projects: catalog.projects.map((p) =>
      p.id === "accounts-api" ? { ...p, issues: [...p.issues].reverse() } : p,
    ),
  });
  assert.equal(reordered.findIssue("GO-002")?.slug, "pagination-params");
  assert.equal(reordered.findIssue("GO-003")?.slug, "parse-log-line");
  assert.equal(reordered.findProject("API")!.issues[0].key, "TS-006");
});

test("summaries for client components leave out fixtures and long text", () => {
  const summary = summarize(merged.findIssue("PY-002")!);
  assert.equal(summary.key, "PY-002");
  for (const field of ["criteria", "task", "comments"])
    assert.equal(field in summary, false, field);
  // Nothing left that React's serializer would mangle.
  assert.equal(JSON.stringify(summary).includes("__proto__"), false);
});

test("marks parse as is: qualifiers and filter wherever marks are known", () => {
  const query = parseIssueQuery(
    "is:completed,starred is:runnable is:todo lang:python",
  );
  assert.deepEqual(query.marks, ["starred", "completed"]);
  assert.equal(formatQuery(query), "is:starred,completed lang:python");
  assert.deepEqual(parseIssueQuery("is:nonsense").marks, []);
  const starred = new Set(["PHP-002", "PY-002"]);
  const completed = new Set(["PY-002"]);
  const has = (key: string, mark: "starred" | "completed") =>
    (mark === "starred" ? starred : completed).has(key);
  const keys = (q: string) =>
    filterByMarks(merged.issues, parseIssueQuery(q).marks, has)
      .map((i) => i.key)
      .sort();
  assert.deepEqual(keys("is:starred"), ["PHP-002", "PY-002"]);
  assert.deepEqual(keys("is:starred,completed"), ["PY-002"]);
  assert.equal(keys("").length, merged.issues.length);
});
test("content revisions stay published and never strand work in progress", () => {
  // Every live revision id on main just before the incident was merged (3c40dd4), checked in
  // so the comparison never depends on git history being available. Since then the ENG-325
  // audit revised many issues; their earlier revisions stay, because recorded work names them.
  const before = JSON.parse(
    readFileSync(
      new URL("./pre-incident-revisions.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, string>;
  assert.equal(Object.keys(before).length, 45);
  // JS-001 as it was played while it was the incident, with its chat.
  before["checkout-guest-shipping"] =
    "sha256:ea2bec9e27fb47b645b7cef8c00448c735415c9bda6f93b61a44bedea479b104";
  for (const [id, revision] of Object.entries(before)) {
    assert.ok(catalog.revisions[revision], `${id} revision kept`);
    // Saved code is restored by path onto the live revision: nothing it had may disappear.
    const live =
      catalog.revisions[catalog.issues.find((i) => i.id === id)!.revision];
    assert.deepEqual(
      continuityProblems(catalog.revisions[revision], live),
      [],
      id,
    );
  }
  // The chat lives on only in the revision that had it, read as stored.
  const chat = (revision: string) =>
    (catalog.revisions[revision] as { chat?: unknown[] }).chat;
  assert.ok(chat(before["checkout-guest-shipping"])?.length);
  assert.equal(
    chat(
      catalog.issues.find((i) => i.id === "checkout-guest-shipping")!.revision,
    ),
    undefined,
  );
});
