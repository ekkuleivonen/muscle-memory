import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_CAPTURE_VERSION,
  boardMove,
  boardArrival,
  boardProfile,
  boardShare,
  boardPage,
  boardRecord,
  boardView,
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
    issueKey: "PHP-002",
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
  assert.throws(bad({ from: "done", to: "todo" }), /replay/);
  // Nothing is automatic, Done included.
  assert.throws(bad({ via: "automatic" }), /Unknown way/);
});

test("only a replay takes a done issue back, to In progress, without a pull request", () => {
  const replay = {
    ...base.data,
    from: "done" as const,
    to: "in-progress" as const,
    trigger: "replay" as const,
  };
  const move = boardMove({ ...base, data: replay });
  assert.equal(move.data.trigger, "replay");
  assert.equal("pullRequest" in move.data, false);
  const bad = (change: object) => () =>
    boardMove({ ...base, data: { ...replay, ...change } });
  assert.throws(bad({ to: "todo" }), /replay/);
  assert.throws(bad({ trigger: "status-menu" }), /replay/);
  assert.throws(bad({ from: "todo" }), /replay/);
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
    data: { issueKey: "PHP-002", channel: "x", ref: "ab12cd34ef56", card: { m: 6 } },
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

test("board observations keep the exact Terms version accepted, dated or dated with a revision", async () => {
  const { LEGAL_VERSION } = await import("../../apps/web/lib/legal");
  // What the app ships today, stored exactly as accepted: never mapped to its date.
  assert.equal(LEGAL_VERSION, "2026-10-25.1");
  assert.equal(boardMove({ ...base, termsVersion: LEGAL_VERSION }).consentVersion, "terms-2026-10-25.1");
  // Versions accepted before revisions existed stay valid and unchanged.
  assert.equal(boardMove({ ...base, termsVersion: "2026-10-24" }).consentVersion, "terms-2026-10-24");
  assert.equal(boardMove({ ...base, termsVersion: "2026-10-25.12" }).consentVersion, "terms-2026-10-25.12");
  for (const bad of ["latest", "", "2026-10-25.", "2026-10-25.x", "2026-10-25.1.2", " 2026-10-25", "2026-10-25 ", "2026-1-25", "2026-10-25-1", "terms-2026-10-25"])
    assert.throws(() => boardMove({ ...base, termsVersion: bad }), /Terms version/, JSON.stringify(bad));
});


test("automatic completion records the Submit cause and exact internal submission/run", () => {
  const data = {
    ...base.data,
    from: "in-progress" as const,
    to: "done" as const,
    trigger: "checks-passed" as const,
    via: "keyboard" as const,
    pullRequest: 2,
    runId: "checked-run",
    nudged: false,
  };
  const completed = boardMove({ ...base, data });
  assert.equal(completed.captureVersion, "board-capture-7.3.0");
  assert.deepEqual(completed.data, data);
  for (const change of [
    { runId: undefined },
    { pullRequest: 0 },
    { to: "todo" },
    { via: "automatic" },
  ])
    assert.throws(() => boardMove({ ...base, data: { ...data, ...change } as typeof data }));
});

test("records are canonical and stable", () => {
  const record = boardRecord(boardMove(base));
  assert.equal(record.recordId, "board-4f1c.1");
  assert.equal(boardRecord(boardMove(base)).payload, record.payload);
  assert.deepEqual(JSON.parse(record.payload).data, base.data);
});

test("page views, page state and profile answers; only views may name an issue", () => {
  const { issue: _, data: __, ...common } = base;
  const view = boardView({
    ...common,
    issue: null,
    data: { path: "/challenges", query: "q=kind%3Abug", previous: "/" },
  });
  assert.equal(view.type, "observation.board.viewed");
  assert.equal(view.issue, null);
  assert.equal(view.issueRevision, null);
  assert.deepEqual(view.data, { path: "/challenges", query: "q=kind%3Abug", previous: "/" });
  const onIssue = boardView({
    ...common,
    issue: base.issue,
    data: { path: "/challenges/PHP-002", query: "", previous: "/challenges" },
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
    data: { from: "settings", answers: { experience: "some", languages: ["python"], answered: ["experience"] } },
  });
  assert.equal(profile.type, "observation.board.profile");
  assert.equal(profile.issue, null);
  assert.throws(() => boardPage({ ...common, elapsedMs: -1, data: page.data }), /elapsed/);
});
