import { test } from "node:test";
import assert from "node:assert/strict";
import { comparisonAge, COMPARISON_PRIVACY_ENABLED, syncComparisonPrivacy } from "./comparison-privacy";
import type { PracticeStore } from "../../../packages/browser/practice-store";
test("age eligibility is positive; draft sync is pending and does not access secrets or network", async () => {
  assert.equal(COMPARISON_PRIVACY_ENABLED, false);
  assert.equal(comparisonAge(undefined), "unknown");
  assert.equal(comparisonAge("16-17"), "non-adult");
  assert.equal(comparisonAge("18-24"), "adult");
  const store = new Proxy({}, { get() { assert.fail("disabled transport read secret"); } }) as PracticeStore;
  assert.deepEqual(await syncComparisonPrivacy(store, true, undefined, null), {state: "pending"});
});
