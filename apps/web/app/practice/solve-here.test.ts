import { test } from "node:test";
import assert from "node:assert/strict";
import { readSolveHere, rememberSolveHere, SOLVE_HERE_KEY } from "./solve-here";

const fail = (name: string) => () => {
  throw new DOMException("synthetic", name);
};

test("solving here is remembered for the tab and read back", () => {
  const items = new Map<string, string>();
  const storage = () => ({
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  });
  assert.equal(readSolveHere(storage), false);
  rememberSolveHere(storage);
  assert.equal(items.get(SOLVE_HERE_KEY), "1");
  assert.equal(readSolveHere(storage), true);
});

test("storage whose getItem or setItem throws never blocks solving here", () => {
  const storage = () => ({
    getItem: fail("SecurityError"),
    setItem: fail("QuotaExceededError"),
  });
  assert.equal(readSolveHere(storage), false);
  assert.doesNotThrow(() => rememberSolveHere(storage));
});

test("storage that can't even be reached is treated as empty", () => {
  assert.equal(readSolveHere(fail("SecurityError")), false);
  assert.doesNotThrow(() => rememberSolveHere(fail("SecurityError")));
});
