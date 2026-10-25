import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_CAPTURE_VERSION,
  boardMove,
  boardPayloads,
  boardRecord,
  boardArrival,
  boardPage,
  boardProfile,
  boardShare,
  boardReply,
  boardView,
  REPLY_LIMIT_BYTES,
} from "./board";

const base = {
  participantId: "synthetic-participant",
  sourceId: "board-4f1c",
  sequence: 1,
  occurredAt: "2026-10-24T10:00:00.000Z",
  elapsedMs: 1234.5,
  termsVersion: "2026-10-24",
  issue: { id: "reset-link-expiry", revision: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
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
  assert.equal(move.issue, "reset-link-expiry");
  assert.equal(move.issueRevision, base.issue.revision);
  assert.equal(move.elapsedMs, 1234.5);
  assert.ok(move.captureGaps.includes("keystrokes-in-text-fields"));
  assert.ok(!move.captureGaps.includes("issue-views"));
  assert.deepEqual(move.data, base.data);
});

test("malformed moves are refused rather than stored", () => {
  const bad = (change: object) => () => boardMove({ ...base, ...change });
  assert.throws(bad({ sequence: 0 }), /positive/);
  assert.throws(bad({ participantId: "ann@example.com" }), /opaque/);
  assert.throws(bad({ issue: { id: "x", revision: "latest" } }), /exact/);
  assert.throws(bad({ occurredAt: "yesterday" }), /time/);
  assert.throws(bad({ termsVersion: "" }), /Terms/);
  assert.throws(bad({ termsVersion: "2026-10-24.x" }), /Terms/);
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

test("only merging a pull request moves an issue to Done", () => {
  const done = {
    ...base.data,
    from: "in-progress" as const,
    to: "done" as const,
    via: "pointer" as const,
    trigger: "pull-request-merged" as const,
    pullRequest: 3,
    runId: "7f3c9a2e-41b8-4d0e-9a51-2c6f0e8b1d44",
  };
  const move = boardMove({ ...base, data: done });
  assert.equal(move.data.to, "done");
  assert.equal(move.data.runId, done.runId);
  assert.equal(move.data.pullRequest, 3);
  // The person merges it, by pointer or keyboard.
  assert.equal(boardMove({ ...base, data: { ...done, via: "keyboard" } }).data.via, "keyboard");
  // Manual moves never carry a pull request or run.
  assert.equal("runId" in boardMove(base).data, false);
  assert.equal("pullRequest" in boardMove(base).data, false);
  const bad = (change: object) => () =>
    boardMove({ ...base, data: { ...done, ...change } });
  assert.throws(bad({ trigger: "status-menu" }), /Done/);
  assert.throws(bad({ runId: undefined }), /Done/);
  assert.throws(bad({ pullRequest: 0 }), /Done/);
  assert.throws(bad({ from: "done", to: "todo" }), /on to Done/);
  // Nothing is automatic, Done included.
  assert.throws(bad({ via: "automatic" }), /Unknown way/);
});

test("a reply to a review comment is recorded on the board, its text bounded", () => {
  const reply = boardReply({
    ...base,
    data: { issueKey: "API-2", pullRequest: 3, comment: "ada-abs", text: "Refunds stay negative." },
  });
  assert.equal(reply.type, "observation.board.replied");
  assert.equal(reply.captureVersion, BOARD_CAPTURE_VERSION);
  assert.deepEqual(reply.data, {
    issueKey: "API-2",
    pullRequest: 3,
    comment: "ada-abs",
    text: "Refunds stay negative.",
    textBytes: 22,
    truncated: false,
  });
  const long = boardReply({
    ...base,
    data: { issueKey: "API-2", pullRequest: 3, comment: "ada-abs", text: "é".repeat(REPLY_LIMIT_BYTES) },
  });
  assert.equal(long.data.truncated, true);
  assert.equal(long.data.textBytes, REPLY_LIMIT_BYTES * 2);
  assert.ok(new TextEncoder().encode(long.data.text).length <= REPLY_LIMIT_BYTES);
  assert.deepEqual(boardPayloads([boardRecord(reply)]).length, 1);
  for (const data of [
    { issueKey: "API-2", pullRequest: 0, comment: "ada-abs", text: "x" },
    { issueKey: "API-2", pullRequest: 3, comment: "ada-abs", text: "  " },
  ])
    assert.throws(() => boardReply({ ...base, data }));
});

test("page views, page state and profile answers; only views may name an issue", () => {
  const { issue: _, data: __, ...common } = base;
  const view = boardView({
    ...common,
    issue: null,
    data: { path: "/issues", query: "q=kind%3Abug", previous: "/board" },
  });
  assert.equal(view.type, "observation.board.viewed");
  assert.equal(view.issue, null);
  assert.equal(view.issueRevision, null);
  assert.deepEqual(view.data, { path: "/issues", query: "q=kind%3Abug", previous: "/board" });
  const onIssue = boardView({
    ...common,
    issue: base.issue,
    data: { path: "/issues/API-2", query: "", previous: "/issues?q=kind%3Abug" },
  });
  assert.equal(onIssue.issue, "reset-link-expiry");
  assert.throws(
    () =>
      boardView({
        ...common,
        issue: null,
        data: { path: "https://elsewhere.example/x", query: "", previous: null },
      }),
    /app paths/,
  );
  const page = boardPage({
    ...common,
    data: { visible: false, focused: false, width: 1280.4, height: 800 },
  });
  assert.deepEqual(page.data, { visible: false, focused: false, width: 1280, height: 800 });
  const profile = boardProfile({
    ...common,
    data: { from: "dashboard", answers: { experience: "some", languages: ["python"], answered: ["experience"] } },
  });
  assert.equal(profile.type, "observation.board.profile");
  assert.equal(profile.issue, null);
  assert.equal(boardPayloads([boardRecord(view), boardRecord(page), boardRecord(profile)]).length, 3);
  assert.throws(() => boardPage({ ...common, elapsedMs: -1, data: page.data }), /elapsed/);
});

test("arrivals and shares carry a referral code, never anything that names a person", () => {
  const { issue: _, data: __, ...common } = base;
  const arrived = boardArrival({
    ...common,
    data: { ref: "ab12cd34ef56", landing: "/r/eyJr", landedAt: "2026-10-25T09:59:00.000Z" },
  });
  assert.equal(arrived.type, "observation.board.arrived");
  assert.equal(arrived.issue, null);
  assert.equal(boardArrival({ ...common, data: { ...arrived.data, ref: null } }).data.ref, null);
  assert.throws(
    () => boardArrival({ ...common, data: { ...arrived.data, ref: "Not A Code" } }),
    /referral/,
  );
  const shared = boardShare({
    ...common,
    issue: base.issue,
    data: { issueKey: "API-2", channel: "x", ref: "ab12cd34ef56", card: { m: 6 } },
  });
  assert.equal(shared.type, "observation.board.shared");
  assert.equal(shared.issue, base.issue.id);
  assert.throws(
    () => boardShare({ ...common, issue: base.issue, data: { ...shared.data, channel: "fax" as never } }),
    /channel/,
  );
  assert.equal(
    boardProfile({ ...common, data: { from: "play", answers: { languages: ["go"] } } }).data.from,
    "play",
  );
});
