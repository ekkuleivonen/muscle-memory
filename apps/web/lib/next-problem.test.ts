import { test } from "node:test";
import assert from "node:assert/strict";
import { library, summarize } from "./library";
import { nextProblem, nextProblems } from "./next-problem";
import { catalog } from "./test-fixtures";

const issues = library(catalog).issues.map(summarize);
const bySlug = (slug: string) => issues.find((i) => i.slug === slug)!;
const keys = (...slugs: string[]) => new Set(slugs.map((slug) => bySlug(slug).key));

test("after a Python challenge comes another Python one, never the JavaScript one listed first", () => {
  const current = bySlug("species-tally-shared-names");
  const completed = keys("frequency-map", "species-tally-shared-names");
  assert.equal(nextProblem(current, issues, completed)?.language, "python");
  for (const suggested of nextProblems(current, issues, completed, [], 3))
    assert.equal(suggested.language, "python");
});

test("the same language comes first, at about the same difficulty", () => {
  const current = bySlug("frequency-map");
  const next = nextProblem(current, issues, keys("frequency-map"));
  assert.equal(next?.language, "python");
  assert.equal(next?.difficulty, "easy");
  // With every easy Python challenge completed, a medium Python one comes before any other language.
  const easyPython = issues.filter((i) => i.language === "python" && i.difficulty === "easy");
  const after = nextProblem(current, issues, keys(...easyPython.map((i) => i.slug)));
  assert.equal(after?.language, "python");
  assert.equal(after?.difficulty, "medium");
});

test("leaves out the current challenge and completed ones", () => {
  const current = bySlug("format-price");
  const suggested = nextProblems(current, issues, keys("free-shipping-banner"), [], 50).map(
    (i) => i.key,
  );
  assert.ok(!suggested.includes(current.key));
  assert.ok(!suggested.includes(bySlug("free-shipping-banner").key));
  assert.equal(suggested.length, issues.length - 2);
});

test("when the language is used up, a profile language comes before the rest", () => {
  const current = bySlug("workspace-slugs");
  // Every Ruby challenge completed: the profile's Go comes next.
  const ruby = issues.filter((i) => i.language === "ruby").map((i) => i.slug);
  const next = nextProblem(current, issues, keys(...ruby), ["go"]);
  assert.equal(next?.language, "go");
  assert.equal(nextProblem(current, [current], new Set()), null);
});
