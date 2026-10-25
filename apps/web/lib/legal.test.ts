import assert from "node:assert/strict";
import test from "node:test";
import { boardView } from "../../../packages/domain/board";
import { LEGAL_VERSION } from "./legal";

// Every board record (moves, merges, replies, page views) carries the accepted version; one
// the domain refuses silently stops all of them from being saved.
test("the current Terms version is one board records accept", () => {
  const view = boardView({
    participantId: "synthetic-participant",
    sourceId: "board-4f1c",
    sequence: 1,
    occurredAt: "2026-10-25T10:00:00.000Z",
    elapsedMs: 1,
    termsVersion: LEGAL_VERSION,
    issue: null,
    data: { path: "/issues", query: "", previous: null },
  });
  assert.equal(view.consentVersion, `terms-${LEGAL_VERSION}`);
});
