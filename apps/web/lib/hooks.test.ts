import { test } from "node:test";
import assert from "node:assert/strict";
import { HOOKS, hookFor } from "./hooks";

test("a hook shows only on the exact revision it was checked against", () => {
  assert.deepEqual(Object.keys(HOOKS).sort(), [
    "API-8",
    "DATA-6",
    "QUICK-2",
    "SHOP-5",
  ]);
  for (const [key, hook] of Object.entries(HOOKS)) {
    assert.match(hook.revision, /^sha256:[0-9a-f]{64}$/);
    assert.equal(hookFor({ key, revision: hook.revision }), hook.text);
    // Any other revision, older or newer, falls back to the plain title and summary.
    assert.equal(hookFor({ key, revision: "sha256:" + "0".repeat(64) }), null);
  }
  assert.equal(
    hookFor({ key: "FN-5", revision: "sha256:" + "1".repeat(64) }),
    null,
  );
});

test("hooks name the problem, never an approach", () => {
  for (const { text } of Object.values(HOOKS))
    assert.doesNotMatch(
      text,
      /\b(regex|split|trim|join|left join|distinct|group by|lowercase|twice|double[- ]count|discount applied|hint|AI)\b/i,
    );
});

test("hooks describe the challenge, never a person", () => {
  // First-person identity, craft or debate lines are campaign drafts, not share copy.
  for (const { text } of Object.values(HOOKS)) {
    assert.doesNotMatch(
      text,
      /\b(I|I'm|I've|me|my|we|our|you lost|still got it)\b/i,
    );
    assert.ok(text.length <= 120, text);
  }
});
