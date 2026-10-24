import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Catalog } from "../../../packages/catalog/catalog";
import type { Adventure } from "../../../packages/domain/assessment";
import {
  difficultyRange,
  issueHref,
  languagesOf,
  library,
  summarize,
} from "./library";
import {
  filterProjects,
  filterIssues,
  formatQuery,
  groupIssues,
  href,
  parseProjectQuery,
  parseIssueQuery,
  toggle,
} from "./queries";

const read = (path: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../content/${path}`, import.meta.url), "utf8"),
  ) as Catalog;
const reference = read("catalog/reference.v1.json");
const demo = read("demo/catalog.json");
const merged = library({
  ...reference,
  entries: { ...reference.entries, ...demo.entries },
});

test("issues are the latest published Challenge versions with their projects", () => {
  const { issues, projects } = library(reference);
  assert.deepEqual(
    issues.map((i) => [
      i.key,
      i.slug,
      i.version,
      i.runnable,
      i.kind,
      i.estimate,
    ]),
    [["FN-1", "frequency-map", "2.1.0", true, "feature", 1]],
  );
  const [issue] = issues;
  assert.equal(issue.title, "Frequency map");
  assert.deepEqual(issue.project, {
    slug: "field-notes",
    title: "Field notes",
    key: "FN",
    hue: issue.project?.hue,
  });
  assert.deepEqual(issue.criteria[1], { input: [], expected: {} });
  assert.equal(issue.comments[0].author, "Priya K");
  assert.deepEqual(
    projects.map((c) => [c.slug, c.version, c.issues.map((i) => i.version)]),
    [["field-notes", "2.0.0", ["2.1.0"]]],
  );
});

test("older and disabled versions stay out of lists but specific versions resolve", () => {
  const { issueVersion } = library(reference);
  assert.equal(issueVersion("frequency-map", "1.0.0")?.runnable, false);
  assert.equal(issueVersion("frequency-map", "9.9.9"), undefined);
  const key = "challenge:frequency-map@2.1.0";
  const disabled = library({
    ...reference,
    entries: {
      ...reference.entries,
      [key]: { ...reference.entries[key], state: "disabled" as const },
    },
  });
  assert.deepEqual(disabled.projects[0].issues, []);
  // 2.0.0 is still published, so the issue itself remains listed at that version.
  assert.equal(disabled.issues[0].version, "2.0.0");
});

test("only Python with a starter runs; project summaries span their issues", () => {
  assert.deepEqual(
    merged.issues.filter((i) => i.runnable).map((i) => i.slug),
    ["frequency-map"],
  );
  const edge = merged.projects.find((c) => c.slug === "edge-proxy")!;
  assert.equal(difficultyRange(edge.issues), "easy–hard");
  assert.deepEqual(languagesOf(edge.issues), ["rust", "c", "cpp"]);
});

test("issue keys come from the project key, or one derived from its id", () => {
  const keys = Object.fromEntries(merged.issues.map((i) => [i.slug, i.key]));
  assert.equal(keys["frequency-map"], "FN-1");
  assert.equal(keys["parse-log-line"], "API-4");
  assert.equal(keys["lru-cache"], "EDGE-3");
  assert.deepEqual(
    merged.projects.map((c) => c.key),
    ["FN", "SHOP", "API", "DATA", "EDGE"],
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
  assert.equal(query.runnable, true);
  assert.equal(query.sort, "title");
  assert.deepEqual(query.text, ["log parser", "colour:red"]);
  assert.equal(
    formatQuery(query),
    'is:runnable kind:bug lang:python project:edge-proxy label:maps sort:title "log parser" colour:red',
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
    "DATA-1",
    "EDGE-3",
    "SHOP-1",
    "SHOP-2",
  ]);
  assert.deepEqual(keys("kind:bug lang:go"), ["API-1", "API-4"]);
  assert.deepEqual(keys("lang:rust,go"), [
    "API-1",
    "API-4",
    "EDGE-2",
    "EDGE-4",
  ]);
  assert.deepEqual(keys("is:runnable"), ["FN-1"]);
  assert.deepEqual(keys("label:strings"), [
    "API-4",
    "DATA-1",
    "SHOP-1",
    "SHOP-2",
  ]);
  assert.deepEqual(keys("project:field-notes"), ["FN-1"]);
  assert.deepEqual(keys("API-4"), ["API-4"]);
  assert.deepEqual(keys("parser"), ["API-4"]);
  assert.deepEqual(keys("rust hard"), []);
  // Natural key order by default; difficulty and title on request.
  assert.deepEqual(keys("project:edge-proxy"), [
    "EDGE-1",
    "EDGE-2",
    "EDGE-3",
    "EDGE-4",
  ]);
  assert.equal(keys("sort:difficulty")[0], "FN-1");
  assert.equal(keys("sort:difficulty").at(-1), "EDGE-3");
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
      ["bug", 7],
      ["performance", 2],
    ],
  );
  assert.deepEqual(
    groupIssues(issues, "project", merged.projects).map((g) => g.id),
    ["storefront", "accounts-api", "data-platform", "edge-proxy"],
  );
  assert.equal(
    groupIssues(issues, "none", merged.projects)[0].issues.length,
    9,
  );
});

test("project queries search their issues too", () => {
  const slugs = (q: string) =>
    filterProjects(merged.projects, parseProjectQuery(q)).map((c) => c.slug);
  assert.deepEqual(slugs("lang:cpp"), ["edge-proxy"]);
  assert.deepEqual(slugs("csv"), ["data-platform"]);
  assert.equal(slugs("").length, 5);
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

test("issues are found by permanent key, in any case, or by an older slug link", () => {
  const lru = merged.findIssue("EDGE-3")!;
  assert.equal(lru.slug, "lru-cache");
  assert.equal(merged.findIssue("edge-3"), lru);
  assert.equal(merged.findIssue("lru-cache"), lru);
  assert.equal(merged.findIssue("EDGE-99"), undefined);
  assert.equal(issueHref(lru), "/issues/EDGE-3/lru-cache");
  assert.equal(
    issueHref({ ...lru, version: "0.9.0" }, lru.version),
    "/issues/EDGE-3/lru-cache?version=0.9.0",
  );
});

test("keys come from authored numbers, not from list position", () => {
  const key = "adventure:accounts-api@1.0.0";
  const entry = demo.entries[key];
  const content = entry.content as Adventure;
  // Reordering a project must not renumber its issues.
  const reordered = library({
    ...demo,
    entries: {
      ...demo.entries,
      [key]: {
        ...entry,
        content: { ...content, challenges: [...content.challenges].reverse() },
      },
    },
  });
  assert.equal(reordered.findIssue("API-1")?.slug, "pagination-params");
  assert.equal(reordered.findIssue("API-4")?.slug, "parse-log-line");
});

test("summaries for client components leave out fixtures and long text", () => {
  const summary = summarize(merged.findIssue("FN-1")!);
  assert.equal(summary.key, "FN-1");
  for (const field of ["criteria", "task", "comments"])
    assert.equal(field in summary, false, field);
  // Nothing left that React's serializer would mangle.
  assert.equal(JSON.stringify(summary).includes("__proto__"), false);
});
