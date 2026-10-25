import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStars, toggleStar } from "./stars";

test("stars toggle by key and survive malformed storage", () => {
  assert.deepEqual(parseStars(null), []);
  assert.deepEqual(parseStars("not json"), []);
  assert.deepEqual(parseStars('{"PY-002":true}'), []);
  assert.deepEqual(parseStars('["PY-002", 3, "PY-002", "PHP-002"]'), [
    "PY-002",
    "PHP-002",
  ]);
  const on = toggleStar([], "PY-002");
  assert.deepEqual(on, ["PY-002"]);
  assert.deepEqual(toggleStar(on, "PY-002"), []);
});
