import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Catalog } from "../../../packages/catalog/catalog";
import { difficultyRange, languagesOf, library } from "./library";
import {
  filterCategories,
  filterIssues,
  formatQuery,
  groupIssues,
  href,
  parseCategoryQuery,
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

test("issues are the latest published Challenge versions with their categories", () => {
  const { issues, categories } = library(reference);
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
  assert.deepEqual(issue.categories, [
    {
      slug: "field-notes",
      title: "Field notes",
      key: "FN",
      hue: issue.categories[0].hue,
    },
  ]);
  assert.deepEqual(issue.criteria[1], { input: [], expected: {} });
  assert.equal(issue.comments[0].author, "Priya K");
  assert.deepEqual(
    categories.map((c) => [c.slug, c.version, c.issues.map((i) => i.version)]),
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
  assert.deepEqual(disabled.categories[0].issues, []);
  // 2.0.0 is still published, so the issue itself remains listed at that version.
  assert.equal(disabled.issues[0].version, "2.0.0");
});

test("only Python with a starter runs; category summaries span their issues", () => {
  assert.deepEqual(
    merged.issues.filter((i) => i.runnable).map((i) => i.slug),
    ["frequency-map"],
  );
  const lighthouse = merged.categories.find((c) => c.slug === "lighthouse")!;
  assert.equal(difficultyRange(lighthouse.issues), "easy–medium");
  assert.deepEqual(languagesOf(lighthouse.issues), ["python", "rust", "c"]);
});

test("issue keys come from the category key, or one derived from its id", () => {
  const keys = Object.fromEntries(merged.issues.map((i) => [i.slug, i.key]));
  assert.equal(keys["frequency-map"], "FN-1");
  assert.equal(keys["parse-log-line"], "NS-2");
  assert.equal(keys["harvest-totals"], "RG-4");
  assert.deepEqual(
    merged.categories.map((c) => c.key),
    ["FN", "NS", "LH", "RG"],
  );
  assert.ok(merged.categories.every((c) => c.hue >= 0 && c.hue < 8));
});

test("qualifiers parse into filters; unknown ones stay as text", () => {
  const query = parseIssueQuery(
    'kind:bug,BUG lang:python,klingon is:runnable sort:title label:maps cat:night-shift "log parser" colour:red',
  );
  assert.deepEqual(query.kind, ["bug"]);
  assert.deepEqual(query.language, ["python"]);
  assert.deepEqual(query.label, ["maps"]);
  assert.deepEqual(query.category, ["night-shift"]);
  assert.equal(query.runnable, true);
  assert.equal(query.sort, "title");
  assert.deepEqual(query.text, ["log parser", "colour:red"]);
  assert.equal(
    formatQuery(query),
    'is:runnable kind:bug lang:python category:night-shift label:maps sort:title "log parser" colour:red',
  );
  assert.equal(parseIssueQuery("x".repeat(500)).text[0].length, 200);
});

test("filters combine across qualifiers and match any value within one", () => {
  const keys = (q: string) =>
    filterIssues(merged.issues, parseIssueQuery(q)).map((i) => i.key);
  assert.deepEqual(keys("kind:bug"), ["LH-1", "LH-3", "NS-2"]);
  assert.deepEqual(keys("kind:bug lang:rust"), ["LH-1"]);
  assert.deepEqual(keys("lang:rust,go"), ["LH-1", "NS-2"]);
  assert.deepEqual(keys("is:runnable"), ["FN-1"]);
  assert.deepEqual(keys("label:strings"), ["LH-1", "LH-3", "NS-2"]);
  assert.deepEqual(keys("category:field-notes"), ["FN-1"]);
  assert.deepEqual(keys("NS-2"), ["NS-2"]);
  assert.equal(keys("garden").length, 4);
  assert.deepEqual(keys("rust hard"), []);
  // Natural key order by default; difficulty and title on request.
  assert.deepEqual(keys("category:rooftop-garden"), [
    "RG-1",
    "RG-2",
    "RG-3",
    "RG-4",
  ]);
  assert.equal(keys("sort:difficulty")[0], "FN-1");
  assert.equal(keys("sort:difficulty").at(-1), "RG-4");
});

test("groups keep their declared order and drop empty ones", () => {
  const issues = filterIssues(
    merged.issues,
    parseIssueQuery("kind:bug,performance"),
  );
  assert.deepEqual(
    groupIssues(issues, "kind", merged.categories).map((g) => [
      g.id,
      g.issues.length,
    ]),
    [
      ["bug", 3],
      ["performance", 1],
    ],
  );
  assert.deepEqual(
    groupIssues(issues, "category", merged.categories).map((g) => g.id),
    ["night-shift", "lighthouse", "rooftop-garden"],
  );
  assert.equal(
    groupIssues(issues, "none", merged.categories)[0].issues.length,
    4,
  );
});

test("category queries search their issues too", () => {
  const slugs = (q: string) =>
    filterCategories(merged.categories, parseCategoryQuery(q)).map(
      (c) => c.slug,
    );
  assert.deepEqual(slugs("lang:cpp"), ["rooftop-garden"]);
  assert.deepEqual(slugs("morse"), ["lighthouse"]);
  assert.equal(slugs("").length, 4);
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
