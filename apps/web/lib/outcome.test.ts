import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeOutcome,
  encodeOutcome,
  outcomeLines,
  outcomeOf,
  outcomeSentence,
  publicOutcome,
  type Outcome,
  type RecordedCompletion,
} from "./outcome";
import { encodeResult, type Result } from "./result";
import { inspectCard } from "./share";

const HEX = "de8621e616e78cb42b58d2d189a0b9738171c3345ef3193d1af425130e4ba130";
const REV = `sha256:${HEX}`;
let n = 0;
const full = (
  at: string,
  runId: string,
  passed: number,
  total: number,
  revision = REV,
) => ({
  kind: "observation" as const,
  recordId: `o${++n}`,
  participantId: "p",
  payload: JSON.stringify({
    type: "observation.workspace.pull-request",
    issue: "collected-by-partner",
    issueRevision: revision,
    occurredAt: at,
    source: { id: "s", sequence: n },
    data: {
      number: 1,
      push: n,
      runId,
      passed,
      total,
      result: passed === total ? "checks-passed" : "checks-failed",
    },
  }),
});
const completion: RecordedCompletion = {
  issue: "collected-by-partner",
  revision: REV,
  key: "DATA-6",
  at: "2026-10-25T10:05:00.000Z",
  runId: "r-3",
  automatic: true,
};
const records = [
  full("2026-10-25T10:00:00.000Z", "r-0", 9, 15, "sha256:" + "a".repeat(64)), // another revision
  full("2026-10-25T10:01:00.000Z", "r-1", 11, 15),
  full("2026-10-25T10:03:00.000Z", "r-2", 14, 15),
  full("2026-10-25T10:04:00.000Z", "r-3", 15, 15),
  full("2026-10-25T10:09:00.000Z", "r-4", 13, 15), // after the completion
];
const card: Outcome = {
  v: 3,
  k: "DATA-6",
  l: "sql",
  rv: HEX,
  o: { passed: 15, total: 15 },
  f: { passed: 11, total: 15 },
  n: 3,
  c: "ab12cd34ef56",
};

test("a v3 card comes only from a recorded checks-passed completion and its full checks", () => {
  assert.deepEqual(
    outcomeOf({
      records,
      completion,
      language: "sql",
      referral: "ab12cd34ef56",
    }),
    card,
  );
  const of = (c: Partial<RecordedCompletion>, r = records) =>
    outcomeOf({
      records: r,
      completion: { ...completion, ...c },
      language: "sql",
      referral: "ab12cd34ef56",
    });
  // A legacy merge is never turned into a v3 card, and no v2 merge is invented for this one.
  assert.equal(of({ automatic: false }), null);
  // The completing run must be recorded, on this revision, passing every check.
  assert.equal(of({ runId: "r-9" }), null);
  assert.equal(of({ runId: "r-2" }), null);
  assert.equal(
    of({ revision: "sha256:" + "a".repeat(64), runId: "r-0" }),
    null,
  );
  assert.equal(of({ revision: "not-a-hash" }), null);
  // Only the final check recorded: first = final, one full check.
  assert.deepEqual(of({}, [records[3]]), {
    ...card,
    f: { passed: 15, total: 15 },
    n: 1,
  });
});

test("a v3 link carries exactly the allowlisted facts and reads back exactly", () => {
  const leaky = {
    ...card,
    fp: 90,
    fn: 200,
    t: 252,
    e: 4,
    g: 1,
    ks: 214,
    participantId: "x",
  } as unknown as Outcome;
  assert.deepEqual(publicOutcome(leaky), card);
  const segment = encodeOutcome(leaky);
  const json = Buffer.from(segment, "base64url").toString();
  for (const key of [
    '"fp"',
    '"fn"',
    '"t"',
    '"e"',
    '"g"',
    '"ks"',
    "participant",
  ])
    assert.ok(!json.includes(key), key);
  assert.deepEqual(decodeOutcome(segment), card);
  assert.deepEqual(inspectCard(segment), { kind: "outcome", outcome: card });
  // Optional fields may be absent.
  const core = {
    v: 3,
    k: "DATA-6",
    l: "sql",
    rv: HEX,
    o: { passed: 15, total: 15 },
    c: "ab12cd34ef56",
  } as Outcome;
  assert.deepEqual(decodeOutcome(encodeOutcome(core)), core);
  assert.deepEqual(decodeOutcome(encodeOutcome({ ...core, f: null })), {
    ...core,
    f: null,
  });
});

test("a v3 link we would not have made is refused, never shown in part", () => {
  const raw = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  for (const bad of [
    { ...card, fp: 90 },
    { ...card, t: 252 },
    { ...card, o: { passed: 14, total: 15 } },
    { ...card, o: { passed: 0, total: 0 } },
    { ...card, f: { passed: 3, total: 12 } },
    { ...card, f: { passed: 16, total: 15 } },
    { ...card, n: 0 },
    { ...card, rv: "sha256:" + HEX },
    { ...card, k: "<script>" },
    { ...card, c: "Participant-ID" },
    { ...card, c: undefined },
  ]) {
    assert.equal(
      decodeOutcome(raw(bad)),
      null,
      JSON.stringify(bad).slice(0, 60),
    );
    assert.deepEqual(inspectCard(raw(bad)), { kind: "malformed" });
  }
});

test("legacy v2 cards still decode as results, and no card attests how anyone worked", () => {
  const v2: Result = {
    v: 2,
    k: "QUICK-4",
    l: "go",
    c: "ab12cd34ef56",
    t: 252,
    rd: 48,
    ks: 214,
    ty: 9,
    w: 71,
    r: 1,
    g: 1,
    p: 1,
    h: 0,
    ps: 0,
    lt: 0,
    fp: 90,
    fn: 200,
  };
  const read = inspectCard(encodeResult(v2));
  assert.equal(read.kind, "result");
  const title = "Collected-by-partner report overstates split payments";
  assert.equal(
    outcomeSentence(card, "SQL", title),
    `Completed “${title}” (DATA-6) in SQL. All 15 checks passed.`,
  );
  assert.equal(
    outcomeSentence(card, "SQL", undefined, "first"),
    "I completed DATA-6 in SQL. All 15 checks passed.",
  );
  assert.deepEqual(outcomeLines(card), [
    ["checks passed", "15/15", true],
    ["first full check", "11/15"],
    ["full checks run", "3"],
  ]);
  for (const text of [
    outcomeSentence(card, "SQL", title),
    ...outcomeLines(card).flat(),
  ])
    assert.doesNotMatch(String(text), /without AI|faster|%|minute|speed|rank/i);
});
