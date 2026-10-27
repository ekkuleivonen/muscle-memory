import { test } from "node:test";
import assert from "node:assert/strict";
import {
  comparisonAge,
  COMPARISON_PRIVACY_ENABLED,
  comparisonPrivacyRequest,
  projectPrivacyResponse,
} from "./comparison-privacy";
import type { PracticeStore } from "../../../packages/browser/practice-store";
test("age eligibility is positive; draft sync is pending and does not access secrets or network", async () => {
  assert.equal(COMPARISON_PRIVACY_ENABLED, false);
  assert.equal(comparisonAge(undefined), "unknown");
  assert.equal(comparisonAge("16-17"), "non-adult");
  assert.equal(comparisonAge("18-24"), "adult");
  const store = new Proxy(
    {},
    {
      get() {
        assert.fail("disabled transport read secret");
      },
    },
  ) as PracticeStore;
  assert.deepEqual(
    await comparisonPrivacyRequest(store, "synthetic", {
      action: "update",
      stealth: true,
      age: "unknown",
      expectedRevision: null,
    }),
    {
      status: "pending",
    },
  );
});

test("HTTP provisional and malformed acknowledgements never confirm; no secret/code fields are projected", () => {
  const value = {
    stealth: true,
    age: "adult",
    revision: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    acknowledged: false,
    secret: "synthetic-secret",
    code: "synthetic-code",
  };
  assert.equal(projectPrivacyResponse(202, { value }).status, "pending");
  assert.equal(projectPrivacyResponse(200, { value }).status, "pending");
  assert.equal(
    projectPrivacyResponse(202, { value: { ...value, acknowledged: true } })
      .status,
    "pending",
  );
  const confirmed = projectPrivacyResponse(200, {
    value: { ...value, acknowledged: true },
  });
  assert.equal(confirmed.status, "ok");
  assert.doesNotMatch(JSON.stringify(confirmed), /secret|code|acknowledged/);
});
