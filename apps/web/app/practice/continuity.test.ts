import { test } from "node:test";
import assert from "node:assert/strict";
import { fitPlace, parseViews, withView, type PracticeView } from "./continuity";

const view: PracticeView = {
  scope: "participant:PY-002:attempt-1",
  place: { ranges: [{ anchor: 100, head: 120 }], main: 0, topLine: 5 },
  outputOpen: true,
  savedAt: "2026-10-25T00:00:00Z",
};

test("corrupt local views are dropped, and an unreadable place is no place", () => {
  assert.deepEqual(parseViews("bad"), []);
  assert.deepEqual(parseViews('[{"scope":"x"}]'), []);
  assert.deepEqual(
    parseViews(JSON.stringify([{ ...view, place: { ranges: [] } }]))[0].place,
    null,
  );
  assert.deepEqual(parseViews(JSON.stringify([view])), [view]);
});

test("a saved place is clamped to the code's length now", () => {
  assert.deepEqual(fitPlace(view.place!, 20), {
    ranges: [{ anchor: 20, head: 20 }],
    main: 0,
    topLine: 5,
  });
});

test("view history replaces only its own attempt and stays bounded", () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ ...view, scope: String(i) }));
  const next = withView(many, { ...view, scope: "3", outputOpen: false });
  assert.equal(next.length, 20);
  assert.equal(next[0].scope, "3");
  assert.equal(next.filter((v) => v.scope === "3").length, 1);
});
