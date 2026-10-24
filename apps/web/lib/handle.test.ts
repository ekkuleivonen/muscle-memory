import { test } from "node:test";
import assert from "node:assert/strict";
import { HANDLE_PATTERN, makeHandle, randomHandle } from "./handle";

test("handles read like Reddit's: Adjective-Noun-1234", () => {
  assert.equal(
    makeHandle(() => 0),
    "Quiet-Compiler-0000",
  );
  assert.equal(
    makeHandle((below) => below - 1),
    "Bold-Vector-9999",
  );
  for (let i = 0; i < 50; i++) assert.match(randomHandle(), HANDLE_PATTERN);
  assert.doesNotMatch("quiet-compiler-1", HANDLE_PATTERN);
});
