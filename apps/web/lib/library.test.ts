import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Catalog } from "../../../packages/catalog/catalog";
import { difficultyRange, languagesOf, library } from "./library";
import {
  filterCategories,
  filterIssues,
  parseCategoryQuery,
  parseIssueQuery,
  toSearch,
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
    issues.map((i) => [i.slug, i.version, i.runnable, i.kind]),
    [["frequency-map", "2.1.0", true, "feature"]],
  );
  const [issue] = issues;
  assert.equal(issue.title, "Frequency map");
  assert.deepEqual(issue.categories, [
    { slug: "field-notes", title: "Field notes" },
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

test("issue queries keep known values, in canonical order, and drop the rest", () => {
  assert.deepEqual(
    parseIssueQuery({
      q: "  maps  ",
      language: ["rust", "klingon", "python", "rust"],
      kind: "bug",
      difficulty: ["impossible"],
      category: ["night-shift", "night-shift"],
    }),
    {
      q: "maps",
      language: ["python", "rust"],
      kind: ["bug"],
      difficulty: [],
      category: ["night-shift"],
    },
  );
  assert.equal(parseIssueQuery({ q: "x".repeat(500) }).q.length, 100);
});

test("filters combine across groups and match any value within a group", () => {
  const slugs = (params: Record<string, string | string[]>) =>
    filterIssues(merged.issues, parseIssueQuery(params)).map((i) => i.slug);
  // All three are easy, so they sort by title.
  assert.deepEqual(slugs({ kind: "bug" }), [
    "parse-log-line",
    "word-wrap",
    "morse-decoder",
  ]);
  assert.deepEqual(slugs({ kind: "bug", language: "rust" }), ["morse-decoder"]);
  assert.deepEqual(slugs({ language: ["rust", "go"] }), [
    "parse-log-line",
    "morse-decoder",
  ]);
  assert.deepEqual(slugs({ q: "garden" }).length, 4);
  assert.deepEqual(slugs({ category: "field-notes" }), ["frequency-map"]);
  assert.deepEqual(slugs({ q: "rust hard" }), []);
  // Sorted by difficulty, then title.
  assert.equal(slugs({})[0], "seed-labels");
  assert.equal(slugs({}).at(-1), "harvest-totals");
});

test("category queries search their issues too", () => {
  const slugs = (params: Record<string, string>) =>
    filterCategories(merged.categories, parseCategoryQuery(params)).map(
      (c) => c.slug,
    );
  assert.deepEqual(slugs({ language: "cpp" }), ["rooftop-garden"]);
  assert.deepEqual(slugs({ q: "morse" }), ["lighthouse"]);
  assert.equal(slugs({}).length, 4);
});

test("links round-trip through the query string", () => {
  const query = parseIssueQuery({ q: "log", kind: "bug" });
  const on = toggle(query, "language", "go");
  assert.equal(toSearch(on), "?q=log&language=go&kind=bug");
  assert.equal(toSearch(toggle(on, "language", "go")), "?q=log&kind=bug");
  assert.equal(toSearch(parseIssueQuery({})), "");
  const back = Object.fromEntries(
    [...new URLSearchParams(toSearch(on)).keys()].map((k) => [
      k,
      new URLSearchParams(toSearch(on)).getAll(k),
    ]),
  );
  assert.deepEqual(parseIssueQuery(back), on);
});
