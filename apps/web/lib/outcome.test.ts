import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeOutcome,
  encodeOutcome,
  outcomeLines,
  outcomeOf,
  publicOutcome,
  type Outcome,
} from "./outcome";
import { inspectCard } from "./share";

const HEX = "de8621e616e78cb42b58d2d189a0b9738171c3345ef3193d1af425130e4ba130";
const REV = `sha256:${HEX}`;
let n = 0;
const observation = (type: string, data: object, attemptId = "attempt-1") => ({
  kind: "observation" as const,
  recordId: `o${++n}`,
  participantId: "p",
  payload: JSON.stringify({
    type,
    challenge: "collected-by-partner",
    challengeRevision: REV,
    attemptId,
    occurredAt: `2026-10-25T10:${String(n).padStart(2, "0")}:00.000Z`,
    source: { id: "s", sequence: n },
    data,
  }),
});
const submitted = (
  runId: string,
  result: string,
  passed: number,
  total = 15,
  rules: string[] = [],
  attemptId?: string,
) =>
  observation(
    "practice.submitted",
    { runId, revision: 1, codeArtifactId: `a-${runId}`, result, passed, total, rules },
    attemptId,
  );
const completed = (runId: string, attemptId?: string) =>
  observation("practice.completed", { runId, codeArtifactId: `a-${runId}`, suggested: null }, attemptId);

const records = [
  submitted("r-0", "passed", 15, 15, [], "attempt-0"), // an earlier attempt
  submitted("r-1", "failed", 11),
  submitted("r-c", "cancelled", 0), // cancelled: not a check that ran
  submitted("r-2", "failed", 14),
  submitted("r-3", "passed", 15),
  completed("r-3"),
];
const of = (r: typeof records, attemptId = "attempt-1", revision = REV) =>
  outcomeOf({
    records: r,
    challenge: { id: "collected-by-partner", key: "SQL-002", revision },
    attemptId,
    language: "sql",
    referral: "ab12cd34ef56",
  });
const card: Outcome = {
  v: 3,
  k: "SQL-002",
  l: "sql",
  rv: HEX,
  o: { passed: 15, total: 15 },
  f: { passed: 11, total: 15 },
  n: 3,
  c: "ab12cd34ef56",
};

test("a card comes only from an attempt's recorded completion and its submissions", () => {
  assert.deepEqual(of(records), card);
  // No completion recorded, or another attempt's: nothing to show.
  assert.equal(of(records.slice(0, -1)), null);
  assert.equal(of(records, "attempt-2"), null);
  assert.equal(of(records, "attempt-1", "not-a-hash"), null);
  // The completing submission must pass every case with no rule firing.
  assert.equal(of([submitted("r-3", "passed", 0, 0), completed("r-3")]), null);
  assert.equal(of([submitted("r-3", "passed", 15, 15, ["sum-distinct"]), completed("r-3")]), null);
  assert.equal(of([completed("r-3")]), null);
});

test("f is the first submission only when its cases were decided; n counts submissions that ran", () => {
  assert.deepEqual(of([submitted("r-3", "passed", 15), completed("r-3")]), {
    ...card,
    f: { passed: 15, total: 15 },
    n: 1,
  });
  const errored = of([submitted("r-1", "errored", 0), submitted("r-3", "passed", 15), completed("r-3")]);
  assert.equal(errored?.f, null);
  assert.equal(errored?.n, 2);
  assert.deepEqual(outcomeLines(errored!)[1], ["first submission", "not known"]);
  const cancelled = of([
    submitted("r-c", "cancelled", 0),
    submitted("r-1", "failed", 11),
    submitted("r-3", "passed", 15),
    completed("r-3"),
  ]);
  assert.equal(cancelled?.f, null);
  assert.equal(cancelled?.n, 2);
  // Submissions after the completion never change the card.
  assert.deepEqual(of([...records, submitted("r-9", "failed", 1)]), card);
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
    k: "SQL-002",
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
  // Bounded before decoding: an oversized or non-base64url segment is never parsed.
  const padded = raw({ ...card, k: "SQL-002", pad: "x".repeat(2000) });
  assert.equal(decodeOutcome(padded), null);
  assert.equal(decodeOutcome(encodeOutcome(card) + "!"), null);
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

test("a card of another version is refused, never shown as a result", () => {
  const raw = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  assert.deepEqual(inspectCard(raw({ v: 2, k: "SQL-002", l: "sql", c: "ab12cd34ef56" })), {
    kind: "malformed",
  });
  assert.deepEqual(inspectCard("not-a-card"), { kind: "malformed" });
});
