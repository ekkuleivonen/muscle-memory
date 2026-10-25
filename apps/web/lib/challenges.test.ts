import { test } from "node:test";
import assert from "node:assert/strict";
import { indexChallenges, summarize } from "./challenges";
import {
  filterByMarks,
  filterChallenges,
  formatQuery,
  parseChallengeQuery,
  toggle,
} from "./queries";
import { catalog } from "./test-fixtures";

const index = indexChallenges(catalog);

test("challenges are live metadata over their revisions", () => {
  const challenge = index.findChallenge("PY-002")!;
  const meta = catalog.challenges.find((c) => c.key === "PY-002")!;
  assert.deepEqual(
    [challenge.key, challenge.revision, challenge.runnable, challenge.difficulty],
    ["PY-002", meta.revision, true, "easy"],
  );
  assert.equal(challenge.title, "Nightly vial tally is empty");
  assert.deepEqual(challenge.tags, ["iteration", "maps", "edge-cases"]);
  // The examples are the visible cases, as they are shown.
  assert.deepEqual(challenge.criteria[1], { input: [], expected: {} });
  assert.equal(index.revision(meta.revision)?.challenge, "PY-002");
});

test("every challenge is listed, by key, and runs in the browser", () => {
  assert.equal(index.challenges.length, catalog.challenges.length);
  assert.deepEqual(
    new Set(index.challenges.map((challenge) => challenge.key)),
    new Set(catalog.challenges.map((challenge) => challenge.key)),
  );
  assert.ok(index.challenges.every((i) => i.runnable));
  const keys = index.challenges.map((i) => i.key);
  assert.deepEqual(
    keys,
    [...keys].sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
  );
});

test("challenges are found by key, in any case", () => {
  const lru = index.findChallenge("CPP-001")!;
  assert.equal(lru.language, "cpp");
  assert.equal(index.findChallenge("cpp-001"), lru);
  assert.equal(index.findChallenge("lru-cache"), undefined);
  assert.equal(index.findChallenge("CPP-099"), undefined);
});

test("qualifiers parse into filters; unknown ones stay as text", () => {
  const query = parseChallengeQuery(
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
  assert.equal(parseChallengeQuery("x".repeat(500)).text[0].length, 200);
  // Unknown qualifiers are not search terms: they read as plain text.
  assert.deepEqual(parseChallengeQuery("colour:red").text, ["colour:red"]);
});

test("filters combine across qualifiers and match any value within one", () => {
  const keys = (q: string) =>
    filterChallenges(index.challenges, parseChallengeQuery(q)).map((i) => i.key);
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
  assert.equal(keys("is:runnable").length, index.challenges.length);
  assert.deepEqual(keys("GO-003"), ["GO-003"]);
  assert.deepEqual(keys("parser"), ["GO-003"]);
  assert.deepEqual(keys("rust hard"), []);
  // Natural key order by default; easiest first on request.
  assert.equal(keys("sort:difficulty")[0], "C-001");
  assert.equal(keys("sort:difficulty").at(-1), "TS-006");
});

test("toggles switch one value and round-trip through the search line", () => {
  const query = parseChallengeQuery("tag:maps log");
  const on = toggle(query, "language", "go");
  assert.equal(formatQuery(on), "lang:go tag:maps log");
  assert.equal(formatQuery(toggle(on, "language", "go")), "tag:maps log");
  assert.deepEqual(parseChallengeQuery(formatQuery(on)), on);
});

test("summaries for client components leave out the task and examples", () => {
  const summary = summarize(index.findChallenge("PY-002")!);
  assert.equal(summary.key, "PY-002");
  for (const field of ["criteria", "task"])
    assert.equal(field in summary, false, field);
  // Nothing left that React's serializer would mangle.
  assert.equal(JSON.stringify(summary).includes("__proto__"), false);
});

test("marks parse as is: qualifiers and filter wherever marks are known", () => {
  const query = parseChallengeQuery("is:completed,starred is:runnable is:todo lang:python");
  assert.deepEqual(query.marks, ["starred", "completed"]);
  assert.equal(formatQuery(query), "is:starred,completed lang:python");
  assert.deepEqual(parseChallengeQuery("is:nonsense").marks, []);
  const starred = new Set(["PHP-002", "PY-002"]);
  const completed = new Set(["PY-002"]);
  const has = (key: string, mark: "starred" | "completed") =>
    (mark === "starred" ? starred : completed).has(key);
  const keys = (q: string) =>
    filterByMarks(index.challenges, parseChallengeQuery(q).marks, has)
      .map((i) => i.key)
      .sort();
  assert.deepEqual(keys("is:starred"), ["PHP-002", "PY-002"]);
  assert.deepEqual(keys("is:starred,completed"), ["PY-002"]);
  assert.equal(keys("").length, index.challenges.length);
});
