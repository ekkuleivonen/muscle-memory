import { test } from "node:test";
import assert from "node:assert/strict";
import { BOARD_CONSENT_VERSION } from "../../../packages/domain/board";
import { consentRecord, parseConsent } from "./activity-log";

test("only consent to the current disclosure counts", () => {
  const stored = consentRecord("2026-10-24T10:00:00Z");
  assert.deepEqual(parseConsent(stored), {
    consentVersion: BOARD_CONSENT_VERSION,
    consentedAt: "2026-10-24T10:00:00Z",
  });
  for (const raw of [
    null,
    "",
    "{",
    "true",
    JSON.stringify({
      consentVersion: "board-activity-device-v0",
      consentedAt: "x",
    }),
    JSON.stringify({ consentVersion: BOARD_CONSENT_VERSION }),
  ])
    assert.equal(parseConsent(raw), null, String(raw));
});
