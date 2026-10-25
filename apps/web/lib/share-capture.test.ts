/**
 * The shared-card contract with board capture (ENG-332 supplies it; ENG-328 owns the version).
 *
 * `observation.board.shared.card` is opaque JSON that names its own card version (`card.v`: 2
 * for a merged pull request's card, 3 for a completed challenge). The validator and ingest
 * never read it, so a v3 card needs no board capture change: it is recorded under whatever
 * board capture version is current, and everything that version means (in particular a
 * `checks-passed` completion) keeps working. Records queued under older board versions are
 * still accepted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BOARD_CAPTURE_VERSION,
  boardRecord,
  boardShare,
} from "../../../packages/domain/board";
import { ACCEPTED_CAPTURE, checkRecord } from "../../../packages/domain/ingest";
import type { WorkspaceRecord } from "../../../packages/domain/workspace";
import { encodeOutcome, publicOutcome, type Outcome } from "./outcome";
import { publicResult, type Result } from "./result";

const PARTICIPANT = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const REV = `sha256:${"d".repeat(64)}`;
let sequence = 0;
const common = () => ({
  participantId: PARTICIPANT,
  sourceId: "share-capture-test",
  sequence: ++sequence,
  occurredAt: `2026-10-25T12:00:${String(sequence).padStart(2, "0")}.000Z`,
  elapsedMs: sequence,
  termsVersion: "2026-10-01",
});
const v3: Outcome = {
  v: 3,
  k: "SQL-002",
  l: "sql",
  rv: "d".repeat(64),
  o: { passed: 15, total: 15 },
  f: { passed: 11, total: 15 },
  n: 3,
  c: "ab12cd34ef56",
};
const v2 = {
  v: 2,
  k: "SQL-002",
  l: "sql",
  c: "ab12cd34ef56",
  t: 252,
  rd: 48,
  ks: 214,
  ty: 9,
  w: 71,
  r: 4,
  g: 3,
  p: 2,
  h: 0,
  ps: 0,
  lt: 1,
} as Result;
const share = (card: unknown) =>
  boardShare({
    ...common(),
    issue: { id: "collected-by-partner", revision: REV },
    data: {
      issueKey: "SQL-002",
      channel: "copy",
      ref: "ab12cd34ef56",
      card: card as never,
    },
  });
const accepted = (record: WorkspaceRecord) =>
  checkRecord(record, PARTICIPANT, "2026-10-25T12:30:00.000Z");
/** The same record as if it had been queued under an older board capture version. */
const queuedUnder = (
  record: WorkspaceRecord,
  version: string,
): WorkspaceRecord => {
  const value = JSON.parse(record.payload);
  return {
    ...record,
    payload: JSON.stringify({ ...value, captureVersion: version }),
  };
};

test("a v3 card is recorded under the current board capture, unchanged, and ingest accepts it", () => {
  const shared = share(publicOutcome(v3));
  // The card never chooses or bumps the capture version; it carries its own `v`.
  assert.equal(shared.captureVersion, BOARD_CAPTURE_VERSION);
  assert.equal(share(publicResult(v2)).captureVersion, BOARD_CAPTURE_VERSION);
  assert.deepEqual(shared.data.card, v3);
  assert.equal(accepted(boardRecord(shared)).ok, true);
  // Exactly the card its link carries.
  assert.equal(
    Buffer.from(JSON.stringify(shared.data.card)).toString("base64url"),
    encodeOutcome(v3),
  );
});

test("shares queued under every older accepted board version are still accepted", () => {
  const older = ACCEPTED_CAPTURE.filter(
    (v) => v.startsWith("board-capture-") && v !== BOARD_CAPTURE_VERSION,
  );
  assert.ok(older.length > 0);
  for (const version of older) {
    assert.equal(
      accepted(queuedUnder(boardRecord(share(publicResult(v2))), version)).ok,
      true,
      version,
    );
    // An opaque card is opaque under every version: nothing refuses a record for its card.
    assert.equal(
      accepted(queuedUnder(boardRecord(share(publicOutcome(v3))), version)).ok,
      true,
      version,
    );
  }
  // A version ingest doesn't accept is still refused, card or not: no silent widening.
  assert.equal(
    accepted(
      queuedUnder(boardRecord(share(publicOutcome(v3))), "board-capture-9.9.9"),
    ).ok,
    false,
  );
});

// Composed with ENG-328 (its `completions()` reader and `checks-passed` writer at board capture
// 7.2.0): a completion stays visible next to a v3 share, and legacy merges still read.
const completionModule = fileURLToPath(
  new URL("./completion.ts", import.meta.url),
);
test(
  "a checks-passed completion stays visible beside v3 shares, and queued legacy records are accepted",
  {
    skip: existsSync(completionModule)
      ? false
      : "runs once composed with ENG-328's completion reader",
  },
  async () => {
    const { completions } = (await import(completionModule)) as {
      completions: (
        records: readonly WorkspaceRecord[],
        issue?: string,
      ) => { automatic: boolean; runId: string; revision: string }[];
    };
    const { boardMove } = (await import(
      "../../../packages/domain/board"
    )) as unknown as {
      boardMove: (input: unknown) => Parameters<typeof boardRecord>[0];
    };
    const move = (data: Record<string, unknown>) =>
      boardRecord(
        boardMove({
          ...common(),
          issue: { id: "collected-by-partner", revision: REV },
          data: {
            issueKey: "SQL-002",
            from: "in-progress",
            to: "done",
            onBoardBefore: 1,
            nudged: false,
            ...data,
          },
        }),
      );
    const completed = move({
      via: "pointer",
      trigger: "checks-passed",
      runId: "r-3",
      pullRequest: 1,
    });
    const records = [completed, boardRecord(share(publicOutcome(v3)))];
    const seen = completions(records, "collected-by-partner");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].automatic, true);
    assert.equal(seen[0].runId, "r-3");
    assert.equal(seen[0].revision, REV);
    for (const record of records) assert.equal(accepted(record).ok, true);
    // A legacy merge queued under 7.1.0 is still accepted and still read as a completion.
    const merged = queuedUnder(
      move({
        via: "keyboard",
        trigger: "pull-request-merged",
        runId: "r-1",
        pullRequest: 1,
      }),
      "board-capture-7.1.0",
    );
    assert.equal(accepted(merged).ok, true);
    assert.equal(
      completions([merged], "collected-by-partner")[0]?.automatic,
      false,
    );
  },
);
