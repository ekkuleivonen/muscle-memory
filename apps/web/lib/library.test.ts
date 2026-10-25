import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  difficultyRange,
  issueHref,
  languagesOf,
  library,
  projectHref,
  summarize,
} from "./library";
import {
  filterByStatus,
  filterPulls,
  filterProjects,
  filterIssues,
  formatQuery,
  groupIssues,
  href,
  parseProjectQuery,
  parseIssueQuery,
  parsePullQuery,
  toggle,
} from "./queries";
import { continuityProblems } from "../../../packages/content/publish";
import { catalog } from "./test-fixtures";

const merged = library(catalog);

test("unlisted exercises remain addressable in personal history but not discovery", () => {
  assert.equal(
    merged.issues.some((i) => i.key === "QUICK-2"),
    false,
  );
  assert.equal(
    merged.allIssues.find((i) => i.key === "QUICK-2")?.language,
    "javascript",
  );
  assert.equal(
    merged.allIssues.find((i) => i.key === "QUICK-2")?.slug,
    merged.findIssue("QUICK-2")?.slug,
  );
});

test("issues are live metadata over their live revisions, grouped into projects", () => {
  const issue = merged.findIssue("FN-1")!;
  const meta = catalog.issues.find((i) => i.id === "frequency-map")!;
  assert.deepEqual(
    [issue.slug, issue.revision, issue.runnable, issue.kind, issue.estimate],
    ["frequency-map", meta.revision, true, "feature", 1],
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
  assert.equal(retired.findIssue("EDGE-3"), undefined);
  assert.deepEqual(
    retired.findProject("EDGE")!.issues.map((i) => i.key),
    ["EDGE-1", "EDGE-2", "EDGE-4", "EDGE-5", "EDGE-6", "EDGE-7"],
  );
  // Recorded work names the revision it ran against; it stays readable.
  assert.equal(retired.revision(meta.revision)?.issue, "lru-cache");
  // Every revision it ever had, the live one and the earlier ones recorded work may name.
  const own = Object.keys(catalog.revisions).filter(
    (id) => catalog.revisions[id].issue === "lru-cache",
  );
  assert.ok(own.includes(meta.revision) && own.length > 1);
  assert.deepEqual(Object.keys(retired.revisionsOf("lru-cache")).sort(), own.sort());
});

test("issues run when their language has an engine; project summaries span their issues", () => {
  // Every seed issue's language has an engine, with what that engine needs.
  assert.equal(merged.issues.length, 38);
  assert.ok(merged.issues.every((i) => i.runnable));
  const edge = merged.projects.find((c) => c.slug === "edge-proxy")!;
  assert.equal(difficultyRange(edge.issues), "easy–hard");
  assert.deepEqual(languagesOf(edge.issues), ["go", "c", "cpp"]);
});

test("issue keys come from the project key and the issue's number", () => {
  const keys = Object.fromEntries(merged.issues.map((i) => [i.slug, i.key]));
  assert.equal(keys["frequency-map"], "FN-1");
  assert.equal(keys["parse-log-line"], "API-4");
  assert.equal(keys["lru-cache"], "EDGE-3");
  assert.deepEqual(
    merged.projects.map((c) => c.key),
    ["INC", "FN", "SHOP", "API", "DATA", "EDGE"],
  );
  assert.ok(merged.projects.every((c) => c.hue >= 0 && c.hue < 8));
});

test("qualifiers parse into filters; unknown ones stay as text", () => {
  const query = parseIssueQuery(
    'kind:bug,BUG lang:python,klingon is:runnable sort:title label:maps cat:edge-proxy "log parser" colour:red',
  );
  assert.deepEqual(query.kind, ["bug"]);
  assert.deepEqual(query.language, ["python"]);
  assert.deepEqual(query.label, ["maps"]);
  assert.deepEqual(query.project, ["edge-proxy"]);
  assert.equal(query.sort, "title");
  assert.deepEqual(query.text, ["log parser", "colour:red"]);
  assert.equal(
    formatQuery(query),
    // is:runnable from older links is dropped: every issue runs.
    'kind:bug lang:python project:edge-proxy label:maps sort:title "log parser" colour:red',
  );
  assert.equal(parseIssueQuery("x".repeat(500)).text[0].length, 200);
  for (const alias of ["project", "proj", "category", "cat"])
    assert.deepEqual(parseIssueQuery(`${alias}:edge-proxy`).project, [
      "edge-proxy",
    ]);
});

test("filters combine across qualifiers and match any value within one", () => {
  const keys = (q: string) =>
    filterIssues(merged.issues, parseIssueQuery(q)).map((i) => i.key);
  assert.deepEqual(keys("kind:bug"), [
    "API-1",
    "API-2",
    "API-4",
    "API-5",
    "API-6",
    "API-7",
    "API-9",
    "DATA-1",
    "DATA-5",
    "DATA-6",
    "DATA-7",
    "DATA-8",
    "EDGE-3",
    "EDGE-5",
    "EDGE-7",
    "FN-3",
    "FN-4",
    "INC-1",
    "SHOP-1",
    "SHOP-2",
    "SHOP-5",
    "SHOP-7",
    "SHOP-8",
  ]);
  assert.deepEqual(keys("kind:bug lang:go"), ["API-1", "API-4"]);
  assert.deepEqual(keys("lang:rust,go"), [
    "API-1",
    "API-4",
    "API-8",
    "EDGE-2",
    "EDGE-4",
    "EDGE-6",
  ]);
  // Every issue runs, and an old is:runnable link still shows them all.
  assert.equal(keys("is:runnable").length, merged.issues.length);
  assert.deepEqual(keys("label:strings"), [
    "API-4",
    "API-5",
    "API-6",
    "API-8",
    "DATA-1",
    "EDGE-5",
    "FN-2",
    "SHOP-1",
    "SHOP-2",
  ]);
  assert.deepEqual(keys("project:field-notes"), ["FN-1", "FN-2", "FN-3", "FN-4", "FN-5"]);
  // Projects go by their key, as in their URL; the older id form still works.
  assert.deepEqual(keys("project:shop"), [
    "SHOP-1",
    "SHOP-2",
    "SHOP-3",
    "SHOP-4",
    "SHOP-5",
    "SHOP-6",
    "SHOP-7",
    "SHOP-8",
  ]);
  assert.deepEqual(
    keys("project:SHOP,fn"),
    keys("project:storefront,field-notes"),
  );
  assert.deepEqual(keys("API-4"), ["API-4"]);
  assert.deepEqual(keys("parser"), ["API-4"]);
  assert.deepEqual(keys("rust hard"), []);
  // Natural key order by default; difficulty and title on request.
  assert.deepEqual(keys("project:edge-proxy"), [
    "EDGE-1",
    "EDGE-2",
    "EDGE-3",
    "EDGE-4",
    "EDGE-5",
    "EDGE-6",
    "EDGE-7",
  ]);
  assert.equal(keys("sort:difficulty")[0], "FN-1");
  assert.equal(keys("sort:difficulty").at(-1), "SHOP-8");
});

test("groups keep their declared order and drop empty ones", () => {
  const issues = filterIssues(
    merged.issues,
    parseIssueQuery("kind:bug,performance"),
  );
  assert.deepEqual(
    groupIssues(issues, "kind", merged.projects).map((g) => [
      g.id,
      g.issues.length,
    ]),
    [
      ["bug", 23],
      // EDGE-2 is a percentile task, not a performance one, since ENG-329.
      ["performance", 1],
    ],
  );
  assert.deepEqual(
    groupIssues(issues, "project", merged.projects).map((g) => g.id),
    ["incident-response", "field-notes", "storefront", "accounts-api", "data-platform", "edge-proxy"],
  );
  assert.equal(
    groupIssues(issues, "none", merged.projects)[0].issues.length,
    24,
  );
});

test("project queries search their issues too", () => {
  const slugs = (q: string) =>
    filterProjects(merged.projects, parseProjectQuery(q)).map((c) => c.slug);
  assert.deepEqual(slugs("lang:cpp"), ["edge-proxy"]);
  assert.deepEqual(slugs("csv"), ["data-platform"]);
  assert.equal(slugs("").length, 6);
});

test("links toggle one value and round-trip through the URL", () => {
  const query = parseIssueQuery("kind:bug log");
  const on = toggle(query, "language", "go");
  assert.equal(href("/issues", on), "/issues?q=kind%3Abug+lang%3Ago+log");
  assert.equal(
    href("/issues", toggle(on, "language", "go"), "kind"),
    "/issues?q=kind%3Abug+log&group=kind",
  );
  assert.equal(href("/issues", parseIssueQuery("")), "/issues");
  const back = new URL(href("/issues", on), "http://x").searchParams.get("q")!;
  assert.deepEqual(parseIssueQuery(back), on);
});

test("issues are found by permanent key, in any case, or by their id", () => {
  const lru = merged.findIssue("EDGE-3")!;
  assert.equal(lru.slug, "lru-cache");
  assert.equal(merged.findIssue("edge-3"), lru);
  assert.equal(merged.findIssue("lru-cache"), lru);
  assert.equal(merged.findIssue("EDGE-99"), undefined);
  assert.equal(issueHref(lru), "/issues/EDGE-3");
});

test("projects are found by unique key, in any case, or by their id", () => {
  const edge = merged.findProject("EDGE")!;
  assert.equal(edge.slug, "edge-proxy");
  assert.equal(merged.findProject("edge"), edge);
  assert.equal(merged.findProject("edge-proxy"), edge);
  assert.equal(merged.findProject("NOPE"), undefined);
  assert.equal(projectHref(edge), "/projects/EDGE");
  const keys = merged.projects.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("keys come from issue numbers, not from list position", () => {
  // Reordering a project must not renumber its issues.
  const reordered = library({
    ...catalog,
    projects: catalog.projects.map((p) =>
      p.id === "accounts-api" ? { ...p, issues: [...p.issues].reverse() } : p,
    ),
  });
  assert.equal(reordered.findIssue("API-1")?.slug, "pagination-params");
  assert.equal(reordered.findIssue("API-4")?.slug, "parse-log-line");
  assert.equal(reordered.findProject("API")!.issues[0].key, "API-9");
});

test("summaries for client components leave out fixtures and long text", () => {
  const summary = summarize(merged.findIssue("FN-1")!);
  assert.equal(summary.key, "FN-1");
  for (const field of ["criteria", "task", "comments"])
    assert.equal(field in summary, false, field);
  // Nothing left that React's serializer would mangle.
  assert.equal(JSON.stringify(summary).includes("__proto__"), false);
});

test("board statuses parse as is: qualifiers and filter wherever the board is known", () => {
  const query = parseIssueQuery("is:done,todo is:runnable lang:python");
  assert.deepEqual(query.status, ["todo", "done"]);
  assert.equal(formatQuery(query), "is:todo,done lang:python");
  assert.deepEqual(parseIssueQuery("is:nonsense").status, []);
  const onBoard = new Set(["API-2", "FN-1"]);
  const statusOf = (key: string) =>
    onBoard.has(key) ? ("todo" as const) : ("backlog" as const);
  const keys = (q: string) =>
    filterByStatus(merged.issues, parseIssueQuery(q).status, statusOf)
      .map((i) => i.key)
      .sort();
  assert.deepEqual(keys("is:todo"), ["API-2", "FN-1"]);
  assert.equal(keys("is:backlog").length, merged.issues.length - 2);
  assert.equal(keys("is:todo,backlog").length, merged.issues.length);
  assert.deepEqual(keys("is:done"), []);
  assert.deepEqual(
    groupIssues(merged.issues, "status", merged.projects, statusOf).map((g) => [
      g.id,
      g.issues.length,
    ]),
    [
      ["backlog", merged.issues.length - 2],
      ["todo", 2],
    ],
  );
});

test("pull requests search like issues, plus their own state and checks", () => {
  const query = parsePullQuery(
    'is:merged,open checks:FAILED,bogus lang:go project:shop "price list" sort:oldest is:todo',
  );
  assert.deepEqual(query.state, ["open", "merged"]);
  assert.deepEqual(query.checks, ["failed"]);
  assert.deepEqual(query.language, ["go"]);
  assert.deepEqual(query.project, ["shop"]);
  assert.equal(query.sort, "oldest");
  // is:todo is an issue status, not a pull request state: dropped, not searched as text.
  assert.deepEqual(query.text, ["price list"]);
  assert.equal(
    formatQuery(query),
    'is:open,merged checks:failed lang:go project:shop sort:oldest "price list"',
  );

  const shop = { slug: "storefront", title: "Shop", key: "SHOP", hue: 0 };
  const pull = (
    number: number,
    state: "open" | "merged",
    result: string,
    language: "go" | "python",
    at: string,
  ) => ({
    number,
    state,
    result,
    at,
    issue: {
      key: `SHOP-${number}`,
      title: `Issue ${number}`,
      kind: "bug" as const,
      difficulty: "easy" as const,
      language,
      labels: ["money"],
      project: shop,
    },
  });
  const pulls = [
    pull(1, "open", "checks-failed", "go", "2026-10-24T10:00:00Z"),
    pull(2, "merged", "checks-passed", "go", "2026-10-24T11:00:00Z"),
    pull(3, "merged", "merged", "python", "2026-10-24T12:00:00Z"),
  ];
  const numbers = (q: string) =>
    filterPulls(pulls, parsePullQuery(q)).map((p) => p.number);
  assert.deepEqual(numbers(""), [3, 2, 1]);
  assert.deepEqual(numbers("is:open"), [1]);
  // Before capture 1.4.0 a pull request's result said merged: its checks passed.
  assert.deepEqual(numbers("checks:passed"), [3, 2]);
  assert.deepEqual(numbers("lang:go sort:oldest"), [1, 2]);
  assert.deepEqual(numbers("project:shop label:money #2"), [2]);
  assert.deepEqual(numbers("project:api"), []);
});

test("content revisions stay published and never strand work in progress", () => {
  // Every live revision id on main just before the incident was merged (3c40dd4), checked in
  // so the comparison never depends on git history being available. Since then the ENG-325
  // audit revised many issues; their earlier revisions stay, because recorded work names them.
  const before = JSON.parse(
    readFileSync(new URL("./pre-incident-revisions.json", import.meta.url), "utf8"),
  ) as Record<string, string>;
  assert.equal(Object.keys(before).length, 45);
  // INC-1 as it was played while it was the incident, with its chat.
  before["checkout-guest-shipping"] =
    "sha256:ea2bec9e27fb47b645b7cef8c00448c735415c9bda6f93b61a44bedea479b104";
  for (const [id, revision] of Object.entries(before)) {
    assert.ok(catalog.revisions[revision], `${id} revision kept`);
    // Saved code is restored by path onto the live revision: nothing it had may disappear.
    const live = catalog.revisions[catalog.issues.find((i) => i.id === id)!.revision];
    assert.deepEqual(continuityProblems(catalog.revisions[revision], live), [], id);
  }
  // The chat lives on only in the revision that had it, read as stored.
  const chat = (revision: string) => (catalog.revisions[revision] as { chat?: unknown[] }).chat;
  assert.ok(chat(before["checkout-guest-shipping"])?.length);
  assert.equal(chat(catalog.issues.find((i) => i.id === "checkout-guest-shipping")!.revision), undefined);
});
