import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boardMove,
  boardRecord,
  type BoardMoveData,
} from "../../../packages/domain/board";
import type { WorkspaceRecord } from "../../../packages/domain/workspace";
import { profileCompletions } from "./profile-completions";
import { live } from "./test-fixtures";

const revision = live("frequency-map").id;
const at = (minute: number) =>
  new Date(Date.UTC(2026, 9, 25, 10, minute)).toISOString();
const move = (minute: number, data: BoardMoveData) =>
  boardRecord(
    boardMove({
      participantId: "synthetic-profile",
      sourceId: "profile-history",
      sequence: minute,
      occurredAt: at(minute),
      elapsedMs: minute * 60_000,
      termsVersion: "2026-10-25.1",
      issue: { id: "frequency-map", revision },
      data,
    }),
  );
const hint = (minute: number, issue = "frequency-map"): WorkspaceRecord => ({
  recordId: `profile-hint.${minute}`,
  kind: "observation",
  participantId: "synthetic-profile",
  payload: JSON.stringify({
    type: "observation.workspace.hint",
    captureVersion: "workspace-capture-6.0.0",
    source: { id: "profile-hint", sequence: minute },
    occurredAt: at(minute),
    issue,
    issueRevision: revision,
    data: { hint: "legacy-hint", level: 1, text: "PRIVATE_HINT_TEXT" },
  }),
});

test("profile retains historical built-in hint use without leaking text or attributing later/replayed help", () => {
  const completion: BoardMoveData = {
    issueKey: "FN-1",
    from: "in-progress",
    to: "done",
    via: "keyboard",
    trigger: "pull-request-merged",
    onBoardBefore: 1,
    nudged: false,
    pullRequest: 1,
    runId: "old-run",
  };
  const old = move(3, completion);
  const historical = {
    ...old,
    payload: JSON.stringify({
      ...JSON.parse(old.payload),
      captureVersion: "board-capture-7.1.0",
    }),
  };
  const records = [
    hint(1),
    hint(2, "another-challenge"),
    historical,
    hint(4), // After the historical completion, not a fact about that completed result.
    move(5, {
      issueKey: "FN-1",
      from: "done",
      to: "in-progress",
      via: "pointer",
      trigger: "replay",
      onBoardBefore: 0,
      nudged: false,
    }),
    move(6, {
      ...completion,
      trigger: "checks-passed",
      pullRequest: 2,
      runId: "new-run",
    }),
    hint(7), // After the new completion; no "without hints" claim is inferred from zero.
  ];
  const before = JSON.stringify(records);
  const rows = profileCompletions(records);
  assert.deepEqual(
    rows.map((row) => ({ automatic: row.automatic, hints: row.hints })),
    [
      { automatic: true, hints: 0 },
      { automatic: false, hints: 1 },
    ],
  );
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE_HINT_TEXT/);
  assert.equal(
    JSON.stringify(records),
    before,
    "the profile is a read-only projection",
  );
});
