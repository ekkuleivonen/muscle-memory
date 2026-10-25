import { test } from "node:test";
import assert from "node:assert/strict";
import { keyProblem } from "./keys";

test("keys are the language's code and three digits", () => {
  assert.equal(keyProblem("PY-003", "python"), null);
  assert.equal(keyProblem("CPP-012", "cpp"), null);
  assert.match(keyProblem("PY-3", "python")!, /CODE-NNN/);
  assert.match(keyProblem("JS-001", "python")!, /start with PY-/);
  assert.match(keyProblem("PY-000", "python")!, /001/);
  assert.match(keyProblem("XX-001", "klingon")!, /no key code/);
});
