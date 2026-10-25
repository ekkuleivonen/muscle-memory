import { test } from "node:test";
import assert from "node:assert/strict";
import { isPracticePath, practiceHref } from "./paths";

test("practice lives under the picker, and only a challenge's own page is practice", () => {
  assert.equal(practiceHref("PY-003"), "/challenges/PY-003");
  assert.equal(isPracticePath("/challenges/PY-003"), true);
  assert.equal(isPracticePath("/challenges"), false);
  assert.equal(isPracticePath("/challenges/PY-003/extra"), false);
  assert.equal(isPracticePath("/settings"), false);
});
