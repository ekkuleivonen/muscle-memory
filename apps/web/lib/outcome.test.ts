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
type Raw =
  /** Every case scored: `passed` of `total` outputs match. */
  | { kind: "scored"; passed: number; total: number; truncate?: boolean }
  | { kind: "compile-error"; total: number }
  | { kind: "partial"; ran: number; passed: number; total: number }
  | { kind: "timeout"; total: number }
  | { kind: "cancelled"; total: number }
  | { kind: "runner-error"; total: number }
  /** Ran, but no summary was ever recorded for it. */
  | { kind: "unreported"; total: number };

/**
 * A full check as the app records it: queued, then its terminal run with the raw outcome, then
 * the summary record, whose counts for a run that didn't score are synthesized as PR40's
 * `pullRequestResult` does (0/N, cancelled or checks-errored), or partial counts.
 */
const check = (minute: number, runId: string, raw: Raw, revision = REV) => {
  const at = (s: number) =>
    `2026-10-25T10:${String(minute).padStart(2, "0")}:${String(s).padStart(2, "0")}.000Z`;
  const run = {
    runId,
    purpose: "pull-request",
    revision: 1,
    codeArtifactId: `a-${runId}`,
  };
  const outputs = (n: number, passed: number, truncate = false) =>
    Array.from({ length: n }, (_, i) => ({
      index: i,
      output: {
        text: i < passed ? "1" : "0",
        truncated: truncate && i === n - 1,
      },
    }));
  const [status, outcome, summary] = ((): [
    string,
    unknown,
    [string, number] | null,
  ] => {
    switch (raw.kind) {
      case "scored":
        return [
          "result",
          {
            status: "completed",
            phase: "tests",
            cases: outputs(raw.total, raw.passed, raw.truncate),
          },
          [
            raw.passed === raw.total ? "checks-passed" : "checks-failed",
            raw.passed,
          ],
        ];
      case "compile-error":
        return [
          "user-error",
          { status: "user-error", phase: "compile", cases: [] },
          ["checks-errored", 0],
        ];
      case "partial":
        return [
          "user-error",
          {
            status: "user-error",
            phase: "tests",
            cases: outputs(raw.ran, raw.passed),
          },
          ["checks-failed", raw.passed],
        ];
      case "timeout":
        return [
          "timeout",
          { status: "timeout", timeoutMs: 10000 },
          ["checks-errored", 0],
        ];
      case "cancelled":
        return ["cancelled", { status: "cancelled" }, ["cancelled", 0]];
      case "runner-error":
        return [
          "runner-error",
          { status: "runner-error", phase: "execution", message: "x" },
          ["checks-errored", 0],
        ];
      case "unreported":
        return [
          "result",
          { status: "completed", phase: "tests", cases: outputs(raw.total, 0) },
          null,
        ];
    }
  })();
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
      { ...run, status, outcome },
      revision,
    ),
    ...(summary
      ? [
          observation(
            "observation.workspace.pull-request",
            at(11),
            {
              number: 1,
              push: 1,
              runId,
              passed: summary[1],
              total: raw.total,
              result: summary[0],
            },
            revision,
          ),
        ]
      : []),
  ];
};
const pass = (minute: number, runId = "r-3") =>
  check(minute, runId, { kind: "scored", passed: 15, total: 15 });
const completion: RecordedCompletion = {
  issue: "collected-by-partner",
  revision: REV,
  key: "DATA-6",
  at: "2026-10-25T10:05:00.000Z",
  runId: "r-3",
  automatic: true,
};
const records = [
  ...check(0, "r-0", { kind: "scored", passed: 9, total: 15 }, OTHER), // another revision
  ...check(1, "r-1", { kind: "scored", passed: 11, total: 15 }),
  ...check(2, "r-c", { kind: "cancelled", total: 15 }), // cancelled: not a check that ran
  ...check(3, "r-2", { kind: "scored", passed: 14, total: 15 }),
  ...pass(4),
  ...check(9, "r-4", { kind: "scored", passed: 13, total: 15 }), // after the completion
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
    of(check(4, "r-3", { kind: "scored", passed: 0, total: 0 })),
    null,
  );
  assert.equal(of(check(4, "r-3", { kind: "unreported", total: 15 })), null);
  // A completing summary without a completely scored raw run is not a completion we can show.
  assert.equal(
    of(
      check(4, "r-3", {
        kind: "scored",
        passed: 15,
        total: 15,
        truncate: true,
      }),
    ),
    null,
  );
});

test("a v3 card needs the required rules evaluated and satisfied for the checked code", () => {
  assert.deepEqual(of(records, {}, []), card);
  assert.equal(of(records, {}, null), null);
  assert.equal(of(records, {}, [{ id: "priya-sum-distinct" }]), null);
});

test("f is the first full check only when its run was scored completely; n counts checks that ran", () => {
  // Only the completing check: first = final, one check.
  assert.deepEqual(of(pass(4)), {
    ...card,
    f: { passed: 15, total: 15 },
    n: 1,
  });
  // A first Submit that never produced a complete, scorable result → later pass. Its summary
  // record says 0/15 (or partial counts), but that is not an observed result: f is null. It
  // still ran, so it still counts in n.
  for (const [name, first] of [
    ["compile error", { kind: "compile-error", total: 15 }],
    ["timed out", { kind: "timeout", total: 15 }],
    ["runner error", { kind: "runner-error", total: 15 }],
    ["partly executed", { kind: "partial", ran: 6, passed: 2, total: 15 }],
    [
      "cut-short output",
      { kind: "scored", passed: 14, total: 15, truncate: true },
    ],
    ["never reported", { kind: "unreported", total: 15 }],
    ["different suite size", { kind: "scored", passed: 3, total: 12 }],
  ] as [string, Raw][]) {
    const out = of([...check(1, "r-1", first), ...pass(4)]);
    assert.ok(out, name);
    assert.equal(out.f, null, name);
    assert.equal(out.n, 2, name);
    assert.deepEqual(
      outcomeLines(out)[1],
      ["first full check", "not known"],
      name,
    );
  }
  // A cancelled first Submit: f is null and it isn't counted.
  const cancelled = of([
    ...check(1, "r-c", { kind: "cancelled", total: 15 }),
    ...check(2, "r-1", { kind: "scored", passed: 11, total: 15 }),
    ...pass(4),
  ]);
  assert.equal(cancelled?.f, null);
  assert.equal(cancelled?.n, 2);
  // A first check that ran every case and failed some is an observed result.
  assert.deepEqual(
    of([
      ...check(1, "r-1", { kind: "scored", passed: 0, total: 15 }),
      ...pass(4),
    ])?.f,
    { passed: 0, total: 15 },
  );
  // Later activity, even in the same attempt, never changes the card.
  assert.deepEqual(
    of([
      ...records,
      ...check(30, "r-9", { kind: "scored", passed: 1, total: 15 }),
    ]),
    card,
  );
});

test("a card is fixed at the completion: nothing reported afterwards changes it", () => {
  const at = (minute: number, second: number) =>
    `2026-10-25T10:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.000Z`;
  const late = (minute: number, runId: string, data: object) =>
    observation("observation.workspace.run", at(minute, 30), {
      runId,
      purpose: "pull-request",
      revision: 1,
      codeArtifactId: `a-${runId}`,
      ...data,
    });
  const queued = (minute: number, runId: string) =>
    observation("observation.workspace.run", at(minute, 0), {
      runId,
      purpose: "pull-request",
      revision: 1,
      codeArtifactId: `a-${runId}`,
      status: "queued",
    });
  // An earlier full check still running when a later one completed the challenge (r-3 at
  // 10:04:10, completion at 10:05).
  const overlapping = [queued(1, "r-1"), ...pass(4)];
  const before = of(overlapping);
  assert.deepEqual(before, { ...card, f: null, n: 2 });
  // It finishes after the completion with a complete, scored result: f stays null.
  const finished = [
    ...overlapping,
    late(6, "r-1", {
      status: "result",
      outcome: {
        status: "completed",
        phase: "tests",
        cases: Array.from({ length: 15 }, (_, i) => ({
          index: i,
          output: { text: i < 11 ? "1" : "0", truncated: false },
        })),
      },
    }),
    observation("observation.workspace.pull-request", at(6, 31), {
      number: 1,
      push: 1,
      runId: "r-1",
      passed: 11,
      total: 15,
      result: "checks-failed",
    }),
  ];
  assert.deepEqual(of(finished), before);
  // Or it is cancelled after the completion: n stays 2.
  const cancelledLate = [
    ...overlapping,
    late(7, "r-1", { status: "cancelled", outcome: { status: "cancelled" } }),
    observation("observation.workspace.pull-request", at(7, 31), {
      number: 1,
      push: 1,
      runId: "r-1",
      passed: 0,
      total: 15,
      result: "cancelled",
    }),
  ];
  assert.deepEqual(of(cancelledLate), before);
  // The same for the full fixture: anything after 10:05 leaves every fact as it was.
  assert.deepEqual(
    of([
      ...records,
      late(8, "r-2", { status: "cancelled" }),
      observation("observation.workspace.pull-request", at(8, 31), {
        number: 1,
        push: 9,
        runId: "r-1",
        passed: 15,
        total: 15,
        result: "checks-passed",
      }),
    ]),
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
