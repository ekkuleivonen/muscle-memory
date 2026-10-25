import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaTypeOf } from "./languages";

test("code is recorded with its language's media type", () => {
  assert.equal(mediaTypeOf("html"), "text/html; charset=utf-8");
  assert.equal(mediaTypeOf("go"), "text/x-go; charset=utf-8");
});
