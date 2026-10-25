import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardItem } from "./board";
import { library, summarize } from "./library";
import { nextProblem, nextProblems } from "./next-problem";
import { catalog } from "./test-fixtures";

const issues = library(catalog).issues.map(summarize);
const bySlug = (slug: string) => issues.find((i) => i.slug === slug)!;
const done = (slug: string): BoardItem => ({
  key: bySlug(slug).key,
  addedAt: "2026-10-25T10:00:00Z",
  status: "done",
  doneAt: "2026-10-25T10:30:00Z",
});

test("after a Python issue comes another Python issue, never the JavaScript one listed first", () => {
  const current = bySlug("species-tally-shared-names");
  const items = [done("frequency-map"), done("species-tally-shared-names")];
  const next = nextProblem(current, issues, items);
  assert.equal(next?.language, "python");
  for (const suggested of nextProblems(current, issues, items, [], 3))
    assert.equal(suggested.language, "python");
});

test("the same language comes first, at about the same difficulty", () => {
  const current = bySlug("frequency-map");
  // PY-003 is easy like PY-002: the next easy Python challenge by key (PY-001 aside, also easy).
  const next = nextProblem(current, issues, [done("frequency-map")]);
  assert.equal(next?.language, "python");
  assert.equal(next?.difficulty, "easy");
  // With every other easy Python challenge done, a medium Python one comes before any other language.
  const easyPython = issues.filter((i) => i.language === "python" && i.difficulty === "easy");
  const after = nextProblem(current, issues, easyPython.map((i) => done(i.slug)));
  assert.equal(after?.language, "python");
  assert.equal(after?.difficulty, "medium");
});
test("leaves out the current issue, Done ones and work already in progress", () => {
  const current = bySlug("format-price");
  const items: BoardItem[] = [
    done("format-price"),
    { key: bySlug("free-shipping-banner").key, addedAt: "t", status: "in-progress" },
  ];
  const suggested = nextProblems(current, issues, items, [], 50);
  const keys = suggested.map((i) => i.key);
  assert.ok(!keys.includes(current.key));
  assert.ok(!keys.includes(bySlug("free-shipping-banner").key));
  assert.equal(suggested[0].language, "javascript");
});

test("when the language is used up, a profile language comes before the rest", () => {
  const current = bySlug("workspace-slugs");
  // Every Ruby challenge done: the profile's Go comes next.
  const ruby = issues.filter((i) => i.language === "ruby").map((i) => done(i.slug));
  const next = nextProblem(current, issues, ruby, ["go"]);
  assert.equal(next?.language, "go");
  assert.equal(nextProblem(current, [current], []), null);
});
