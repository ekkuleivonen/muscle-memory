import { test } from "node:test";
import assert from "node:assert/strict";
import { quickStart } from "./quick-start";

const challenges = [
  { key: "PY-010", language: "python", difficulty: "hard" as const },
  { key: "PY-002", language: "python", difficulty: "easy" as const },
  { key: "PY-001", language: "python", difficulty: "easy" as const },
  { key: "PY-005", language: "python", difficulty: "medium" as const },
  { key: "JS-001", language: "javascript", difficulty: "easy" as const },
];

test("the easiest challenge in the language comes first, by key", () => {
  assert.equal(quickStart(challenges, "python", () => false)?.key, "PY-001");
  assert.equal(quickStart(challenges, "javascript", () => false)?.key, "JS-001");
});

test("completed ones are skipped, up the difficulties; with all done, the easiest again", () => {
  const done = (...keys: string[]) => (key: string) => keys.includes(key);
  assert.equal(quickStart(challenges, "python", done("PY-001"))?.key, "PY-002");
  assert.equal(quickStart(challenges, "python", done("PY-001", "PY-002"))?.key, "PY-005");
  assert.equal(
    quickStart(challenges, "python", done("PY-001", "PY-002", "PY-005", "PY-010"))?.key,
    "PY-001",
  );
  assert.equal(quickStart(challenges, "go", () => false), null);
});
