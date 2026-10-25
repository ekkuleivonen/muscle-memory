import { test } from "node:test";
import assert from "node:assert/strict";
import { library, summarize } from "./library";
import {
  filterByMarks,
  filterIssues,
  formatQuery,
  parseIssueQuery,
  toggle,
} from "./queries";
import { catalog } from "./test-fixtures";

const merged = library(catalog);

test("challenges are live metadata over their revisions", () => {
  const issue = merged.findIssue("PY-002")!;
  const meta = catalog.challenges.find((c) => c.id === "frequency-map")!;
  assert.deepEqual(
    [issue.slug, issue.revision, issue.runnable, issue.difficulty],
    ["frequency-map", meta.revision, true, "easy"],
  );
  assert.equal(issue.title, "Nightly vial tally is empty");
  assert.deepEqual(issue.tags, ["iteration", "maps", "edge-cases"]);
  // The examples are the visible cases, as they are shown.
  assert.deepEqual(issue.criteria[1], { input: [], expected: {} });
  assert.equal(merged.revision(meta.revision)?.challenge, "frequency-map");
});

test("every challenge is listed, by key, and runs in the browser", () => {
  assert.equal(merged.issues.length, 46);
  assert.ok(merged.issues.every((i) => i.runnable));
  const keys = merged.issues.map((i) => i.key);
  assert.deepEqual(
    keys,
    [...keys].sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
  );
});

test("keys are the language's code and a number", () => {
  const keys = Object.fromEntries(merged.issues.map((i) => [i.slug, i.key]));
  assert.equal(keys["frequency-map"], "PY-002");
  assert.equal(keys["parse-log-line"], "GO-003");
  assert.equal(keys["lru-cache"], "CPP-001");
});

test("challenges are found by key, in any case, or by their id", () => {
  const lru = merged.findIssue("CPP-001")!;
  assert.equal(lru.slug, "lru-cache");
  assert.equal(merged.findIssue("cpp-001"), lru);
  assert.equal(merged.findIssue("lru-cache"), lru);
  assert.equal(merged.findIssue("CPP-099"), undefined);
});

test("qualifiers parse into filters; unknown ones stay as text", () => {
  const query = parseIssueQuery(
    'lang:python,klingon is:runnable sort:title tag:maps "log parser" colour:red',
  );
  assert.deepEqual(query.language, ["python"]);
  assert.deepEqual(query.tag, ["maps"]);
  assert.equal(query.sort, "title");
  assert.deepEqual(query.text, ["log parser", "colour:red"]);
  assert.equal(
    formatQuery(query),
    'lang:python tag:maps sort:title "log parser" colour:red',
  );
  assert.equal(parseIssueQuery("x".repeat(500)).text[0].length, 200);
  // Kinds and projects are not search terms: they read as plain text.
  assert.deepEqual(parseIssueQuery("kind:bug project:shop").text, [
    "kind:bug",
    "project:shop",
  ]);
});

test("filters combine across qualifiers and match any value within one", () => {
  const keys = (q: string) =>
    filterIssues(merged.issues, parseIssueQuery(q)).map((i) => i.key);
  assert.deepEqual(keys("lang:go"), [
    "GO-001",
    "GO-002",
    "GO-003",
    "GO-004",
    "GO-005",
    "GO-006",
    "GO-007",
  ]);
  assert.deepEqual(keys("lang:go tag:parsing"), ["GO-002", "GO-003", "GO-004"]);
  assert.deepEqual(keys("difficulty:hard"), [
    "CPP-001",
    "CPP-002",
    "PY-009",
    "PY-010",
    "TS-005",
    "TS-006",
  ]);
  assert.equal(keys("lang:rust,go").length, 7);
  assert.equal(keys("is:runnable").length, merged.issues.length);
  assert.deepEqual(keys("GO-003"), ["GO-003"]);
  assert.deepEqual(keys("parser"), ["GO-003"]);
  assert.deepEqual(keys("rust hard"), []);
  // Natural key order by default; easiest first on request.
  assert.equal(keys("sort:difficulty")[0], "C-001");
  assert.equal(keys("sort:difficulty").at(-1), "TS-006");
});

test("toggles switch one value and round-trip through the search line", () => {
  const query = parseIssueQuery("tag:maps log");
  const on = toggle(query, "language", "go");
  assert.equal(formatQuery(on), "lang:go tag:maps log");
  assert.equal(formatQuery(toggle(on, "language", "go")), "tag:maps log");
  assert.deepEqual(parseIssueQuery(formatQuery(on)), on);
});

test("summaries for client components leave out the task and examples", () => {
  const summary = summarize(merged.findIssue("PY-002")!);
  assert.equal(summary.key, "PY-002");
  for (const field of ["criteria", "task"])
    assert.equal(field in summary, false, field);
  // Nothing left that React's serializer would mangle.
  assert.equal(JSON.stringify(summary).includes("__proto__"), false);
});

test("marks parse as is: qualifiers and filter wherever marks are known", () => {
  const query = parseIssueQuery("is:completed,starred is:runnable is:todo lang:python");
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
