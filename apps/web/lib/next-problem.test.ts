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

test("the same project comes first, at about the same difficulty", () => {
  const current = bySlug("frequency-map");
  // FN-2 is easy like FN-1, in the same project.
  assert.equal(nextProblem(current, issues, [done("frequency-map")])?.slug, "species-tally-shared-names");
  // With the rest of field-notes done, data-platform's Python comes before any other language.
  const fieldNotes = issues.filter((i) => i.project.slug === "field-notes");
  const next = nextProblem(current, issues, fieldNotes.map((i) => done(i.slug)));
  assert.equal(next?.project.slug, "data-platform");
  assert.equal(next?.language, "python");
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
  const next = nextProblem(current, issues, [done("workspace-slugs")], ["go"]);
  assert.equal(next?.language, "go");
  assert.equal(nextProblem(current, [current], []), null);
});
