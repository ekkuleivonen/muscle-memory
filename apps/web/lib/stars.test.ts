import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStars, toggleStar } from "./stars";

test("stars toggle by key and survive malformed storage", () => {
  assert.deepEqual(parseStars(null), []);
  assert.deepEqual(parseStars("not json"), []);
  assert.deepEqual(parseStars('{"FN-1":true}'), []);
  assert.deepEqual(parseStars('["FN-1", 3, "FN-1", "API-2"]'), [
    "FN-1",
    "API-2",
  ]);
  const on = toggleStar([], "FN-1");
  assert.deepEqual(on, ["FN-1"]);
  assert.deepEqual(toggleStar(on, "FN-1"), []);
});
