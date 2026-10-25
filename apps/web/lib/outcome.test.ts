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
const OTHER = "sha256:" + "a".repeat(64);
let n = 0;
const observation = (
  type: string,
  at: string,
  data: object,
  revision = REV,
) => ({
  kind: "observation" as const,
  recordId: `o${++n}`,
  participantId: "p",
  payload: JSON.stringify({
    type,
    issue: "collected-by-partner",
    issueRevision: revision,
    occurredAt: at,
    source: { id: "s", sequence: n },
    data,
  }),
});
/** A full check: queued, its terminal run, and (when it reported) its recorded result. */
const check = (
  minute: number,
  runId: string,
  outcome: {
    status?: string;
    passed?: number;
    total?: number;
    result?: string;
  } = {},
  revision = REV,
) => {
  const at = (s: number) =>
    `2026-10-25T10:${String(minute).padStart(2, "0")}:${String(s).padStart(2, "0")}.000Z`;
  const status = outcome.status ?? "result";
  const run = {
    runId,
    purpose: "pull-request",
    revision: 1,
    codeArtifactId: `a-${runId}`,
  };
  return [
    observation(
      "observation.workspace.run",
      at(0),
      { ...run, status: "queued" },
      revision,
    ),
    observation(
      "observation.workspace.run",
      at(10),
      { ...run, status },
      revision,
    ),
    ...(outcome.total !== undefined
      ? [
          observation(
            "observation.workspace.pull-request",
            at(11),
            {
              number: 1,
              push: 1,
              runId,
              passed: outcome.passed,
              total: outcome.total,
              result:
                outcome.result ??
                (outcome.passed === outcome.total
                  ? "checks-passed"
                  : "checks-failed"),
            },
            revision,
          ),
        ]
      : []),
  ];
};
const completion: RecordedCompletion = {
  issue: "collected-by-partner",
  revision: REV,
  key: "DATA-6",
  at: "2026-10-25T10:05:00.000Z",
  runId: "r-3",
  automatic: true,
};
const records = [
  ...check(0, "r-0", { passed: 9, total: 15 }, OTHER), // another revision
  ...check(1, "r-1", { passed: 11, total: 15 }),
  ...check(2, "r-c", { status: "cancelled" }), // cancelled: not a check that ran
  ...check(3, "r-2", { passed: 14, total: 15 }),
  ...check(4, "r-3", { passed: 15, total: 15 }),
  ...check(9, "r-4", { passed: 13, total: 15 }), // after the completion
];
const of = (
  r: typeof records,
  c: Partial<RecordedCompletion> = {},
  required: readonly unknown[] | null = [],
) =>
  outcomeOf({
    records: r,
    completion: { ...completion, ...c },
    required,
    language: "sql",
    referral: "ab12cd34ef56",
  });
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
  assert.deepEqual(of(records), card);
  // A legacy merge is never turned into a v3 card, and no v2 merge is invented for this one.
  assert.equal(of(records, { automatic: false }), null);
  // The completing run must be a recorded full check on this revision passing every check.
  assert.equal(of(records, { runId: "r-9" }), null);
  assert.equal(of(records, { runId: "r-2" }), null);
  assert.equal(of(records, { revision: OTHER, runId: "r-0" }), null);
  assert.equal(of(records, { revision: "not-a-hash" }), null);
  assert.equal(
    of([...check(4, "r-3", { passed: 0, total: 0, result: "checks-passed" })]),
    null,
  );
  assert.equal(of([...check(4, "r-3", { status: "result" })]), null); // ran, never reported
});

test("a v3 card needs the required rules evaluated and satisfied for the checked code", () => {
  assert.deepEqual(of(records, {}, []), card);
  assert.equal(of(records, {}, null), null);
  assert.equal(of(records, {}, [{ id: "priya-sum-distinct" }]), null);
});

test("f is the first full check only when complete; n counts checks through the completing run", () => {
  // Only the completing check: first = final, one check.
  assert.deepEqual(of(check(4, "r-3", { passed: 15, total: 15 })), {
    ...card,
    f: { passed: 15, total: 15 },
    n: 1,
  });
  // A first check that errored, was cut short or never reported is not known.
  for (const first of [
    check(1, "r-1", { status: "runner-error" }),
    check(1, "r-1", { status: "timeout" }),
    check(1, "r-1", { passed: 0, total: 15, result: "checks-errored" }),
    check(1, "r-1", { passed: 3, total: 12 }), // a different suite size: not comparable
  ]) {
    const out = of([...first, ...check(4, "r-3", { passed: 15, total: 15 })]);
    assert.equal(out?.f, null);
    assert.equal(out?.n, 2);
  }
  // A cancelled first check is an incomplete first check (f is null) and isn't counted.
  const cancelledFirst = of([
    ...check(1, "r-c", { status: "cancelled" }),
    ...check(2, "r-1", { passed: 11, total: 15 }),
    ...check(4, "r-3", { passed: 15, total: 15 }),
  ]);
  assert.equal(cancelledFirst?.f, null);
  assert.equal(cancelledFirst?.n, 2);
  // Later activity, even in the same attempt, never changes the card.
  assert.deepEqual(
    of([...records, ...check(30, "r-9", { passed: 1, total: 15 })]),
    card,
  );
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
  // Bounded before decoding: an oversized or non-base64url segment is never parsed.
  const padded = raw({ ...card, k: "DATA-6", pad: "x".repeat(2000) });
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
