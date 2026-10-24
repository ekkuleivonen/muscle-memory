import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_CAPTURE_VERSION,
  boardMove,
  boardPayloads,
  boardRecord,
} from "./board";

const base = {
  participantId: "synthetic-participant",
  sourceId: "board-4f1c",
  sequence: 1,
  occurredAt: "2026-10-24T10:00:00.000Z",
  termsVersion: "2026-10-24",
  challenge: { id: "reset-link-expiry", version: "1.0.0" },
  data: {
    issueKey: "API-2",
    from: "backlog" as const,
    to: "in-progress" as const,
    via: "keyboard" as const,
    trigger: "status-menu" as const,
    onBoardBefore: 3,
    nudged: true,
  },
};

test("a board move is a versioned, local-only observation of exactly what moved", () => {
  const move = boardMove(base);
  assert.equal(move.observationId, "board-4f1c.1");
  assert.equal(move.type, "observation.board.moved");
  assert.equal(move.captureVersion, BOARD_CAPTURE_VERSION);
  assert.equal(move.consentVersion, "terms-2026-10-24");
  assert.equal(move.researchConsent, false);
  assert.deepEqual(move.serverReceipt, {
    status: "absent",
    reason: "local-only",
  });
  assert.equal(move.challengeArtifactId, "challenge.reset-link-expiry.1.0.0");
  assert.ok(move.captureGaps.includes("issue-views"));
  assert.deepEqual(move.data, base.data);
});

test("malformed moves are refused rather than stored", () => {
  const bad = (change: object) => () => boardMove({ ...base, ...change });
  assert.throws(bad({ sequence: 0 }), /positive/);
  assert.throws(bad({ participantId: "ann@example.com" }), /opaque/);
  assert.throws(bad({ challenge: { id: "x", version: "latest" } }), /exact/);
  assert.throws(bad({ occurredAt: "yesterday" }), /time/);
  assert.throws(bad({ termsVersion: "" }), /Terms/);
  assert.throws(
    bad({ data: { ...base.data, issueKey: "api-2" } }),
    /issue key/,
  );
  assert.throws(
    bad({ data: { ...base.data, from: "in-progress" } }),
    /between/,
  );
  // Done by hand is refused: only a passing run gets there.
  assert.throws(bad({ data: { ...base.data, to: "done" } }), /Done/);
  assert.throws(bad({ data: { ...base.data, via: "button" } }), /way/);
  assert.throws(bad({ data: { ...base.data, trigger: "magic" } }), /trigger/);
  assert.throws(bad({ data: { ...base.data, onBoardBefore: -1 } }), /count/);
});

test("records are canonical, stable and found again for export", () => {
  const record = boardRecord(boardMove(base));
  assert.equal(record.recordId, "board-4f1c.1");
  assert.equal(record, record);
  assert.equal(boardRecord(boardMove(base)).payload, record.payload);
  assert.deepEqual(
    boardPayloads([
      record,
      {
        recordId: "workspace-1.1",
        kind: "observation",
        participantId: "p",
        payload: '{"type":"observation.workspace.edit"}',
      },
    ]),
    [record.payload],
  );
  assert.deepEqual(JSON.parse(record.payload).data, base.data);
});

test("only a merged pull request moves an issue to Done", () => {
  const done = {
    ...base.data,
    from: "in-progress" as const,
    to: "done" as const,
    via: "automatic" as const,
    trigger: "pull-request-merged" as const,
    pullRequest: 3,
    runId: "7f3c9a2e-41b8-4d0e-9a51-2c6f0e8b1d44",
  };
  const move = boardMove({ ...base, data: done });
  assert.equal(move.data.to, "done");
  assert.equal(move.data.runId, done.runId);
  assert.equal(move.data.pullRequest, 3);
  // Manual moves never carry a pull request or run.
  assert.equal("runId" in boardMove(base).data, false);
  assert.equal("pullRequest" in boardMove(base).data, false);
  const bad = (change: object) => () =>
    boardMove({ ...base, data: { ...done, ...change } });
  assert.throws(bad({ trigger: "status-menu" }), /Done/);
  assert.throws(bad({ via: "pointer" }), /Done/);
  assert.throws(bad({ runId: undefined }), /Done/);
  assert.throws(bad({ pullRequest: 0 }), /Done/);
  assert.throws(bad({ from: "done", to: "todo" }), /on to Done/);
  // Nothing but Done is automatic.
  assert.throws(
    () =>
      boardMove({
        ...base,
        data: { ...base.data, via: "automatic" as const },
      }),
    /Done/,
  );
});
