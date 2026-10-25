import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitView,
  parseViews,
  viewScope,
  withView,
  type WorkspaceView,
} from "./continuity";
const view: WorkspaceView = {
  scope: viewScope("challenge", null),
  tabs: ["removed", "quote.js", "quote.js"],
  active: "removed",
  side: "explorer",
  panel: "pulls",
  savedAt: "2026-10-25T00:00:00Z",
  files: {
    "quote.js": { ranges: [{ anchor: 100, head: 120 }], main: 0, topLine: 5 },
    removed: { ranges: [{ anchor: 2, head: 3 }], main: 0, topLine: 1 },
  },
};
test("continuity tolerates corrupt local views and separates replays", () => {
  assert.deepEqual(parseViews("bad"), []);
  assert.deepEqual(parseViews('[{"scope":"challenge"}]'), []);
  assert.notEqual(viewScope("challenge", null), viewScope("challenge", "replay"));
  assert.notEqual(viewScope("other", null), view.scope);
});
test("changed repo drops missing paths and clamps selections without losing the panel", () => {
  const fitted = fitView(view, {
    paths: ["quote.js", "shipping.js", "tests.js"],
    tabs: ["quote.js", "shipping.js", "tests.js"],
    lengths: { "quote.js": 20, "shipping.js": 50 },
  });
  assert.deepEqual(fitted.tabs, ["quote.js", "shipping.js", "tests.js"]);
  assert.equal(fitted.active, "quote.js");
  assert.equal(fitted.panel, "pulls");
  assert.deepEqual(fitted.files, {
    "quote.js": { ranges: [{ anchor: 20, head: 20 }], main: 0, topLine: 5 },
  });
});
test("view history replaces only its own attempt and stays bounded", () => {
  const many = Array.from({ length: 25 }, (_, i) => ({
    ...view,
    scope: String(i),
  }));
  const next = withView(many, { ...view, scope: "3", active: "quote.js" });
  assert.equal(next.length, 20);
  assert.equal(next[0].scope, "3");
  assert.equal(next.filter((v) => v.scope === "3").length, 1);
});
