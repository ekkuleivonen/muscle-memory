import assert from "node:assert/strict";
import test from "node:test";
import { siteView } from "../../../packages/domain/site";
import { LEGAL_VERSION } from "./legal";

// Every observation carries the accepted version; one the domain refuses silently stops all of
// them from being saved.
test("the current Terms version is one observations accept", () => {
  const view = siteView({
    participantId: "synthetic-participant",
    sessionId: "session-4f1c",
    sourceId: "site-4f1c",
    sequence: 1,
    occurredAt: "2026-10-25T10:00:00.000Z",
    elapsedMs: 1,
    termsVersion: LEGAL_VERSION,
    data: { path: "/challenges", query: "", previous: null },
  });
  assert.equal(view.termsVersion, LEGAL_VERSION);
});
