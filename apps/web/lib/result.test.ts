import { test } from "node:test";
import assert from "node:assert/strict";
import { live } from "./test-fixtures";
import {
  decodeResult,
  duration,
  encodeResult,
  metricsOf,
  sentence,
  type Result,
} from "./result";

const card: Result = {
  v: 2, k: "GO-001", l: "go", c: "ab12cd34ef56",
  t: 252, rd: 48, ks: 214, ty: 9, w: 71, r: 1, g: 1, p: 1, h: 0, ps: 0, lt: 0,
};

test("a card survives its link, and anything we would not have made is refused", () => {
  const segment = encodeResult(card);
  assert.match(segment, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeResult(segment), card);
  for (const bad of [
    { ...card, k: "<script>" },
    { ...card, t: -1 },
    { ...card, w: 1.5 },
    { ...card, c: "Participant-ID" },
    { ...card, v: 1 },
    { ...card, ks: undefined },
  ])
    assert.equal(decodeResult(encodeResult(bad as unknown as Result)), null);
  assert.equal(decodeResult("not base64 json"), null);
  assert.equal(sentence(card, "Go"), "Completed GO-001 in Go.");
  assert.equal(duration(252), "4 min 12 s");
  assert.equal(duration(48), "48 s");
});

test("the numbers come from keystrokes, edits, runs and the page, up to the merge", () => {
  const fixture = live("word-count-python");
  const cases = fixture.revision.checks.cases.filter((c) => c.visible);
  const outcome = (passing: number) => ({
    status: "completed",
    phase: "tests",
    cases: cases.map(({ expected }, i) => ({
      output: { text: JSON.stringify(i < passing ? expected : "wrong"), truncated: false },
    })),
  });
  let n = 0;
  const at = (s: number) => new Date(Date.UTC(2026, 9, 25, 10, 0, s)).toISOString();
  const record = (type: string, s: number, data: Record<string, unknown> = {}, issue = "word-count-python") => ({
    recordId: `w.${++n}`,
    kind: "observation" as const,
    participantId: "p",
    payload: JSON.stringify({
      type, issue, issueRevision: fixture.id, occurredAt: at(s),
      source: { id: "w", sequence: n }, data,
    }),
  });
  // 20 characters in two seconds, a typo fixed with two backspaces, then a slow correction
  // much later (not a typo), and Shift alone (not a keystroke).
  const keys: [number, string, string, string, boolean][] = [];
  for (let i = 0; i < 20; i++) keys.push([10_000 + i * 100, "down", "a", "", false]);
  keys.push([12_500, "down", "Backspace", "", false], [12_600, "down", "Backspace", "", false]);
  keys.push([30_000, "down", "Backspace", "", false], [31_000, "down", "Shift", "S", false]);
  const records = [
    record("observation.workspace.opened", 0),
    record("observation.workspace.edit", 9, { userEvent: "input.type" }),
    record("observation.workspace.keys", 13, { file: "count_words.py", keys }),
    record("observation.workspace.edit", 14, { userEvent: "input.paste" }),
    record("observation.workspace.page", 20, { visible: false }),
    record("observation.workspace.page", 25, { visible: true }),
    record("observation.workspace.run", 30, { purpose: "local", status: "result", outcome: outcome(1) }),
    record("observation.workspace.run", 40, { purpose: "local", status: "result", outcome: outcome(cases.length) }),
    record("observation.workspace.pull-request", 45),
    record("observation.workspace.edit", 50, {}, "another-issue"),
    // After the merge: not counted.
    record("observation.workspace.edit", 300),
  ];
  const m = metricsOf(records, "word-count-python", at(60), (id) => (id === fixture.id ? fixture.revision : undefined));
  assert.deepEqual(m, {
    t: 31, // 9 s + 4 + 1 + 16 + 10 of activity gaps (page and pull-request events are not activity)
    rd: 9,
    ks: 23,
    ty: 1,
    w: 24, // the busiest ten seconds held 20 characters: 120 a minute, 24 words
    r: 2,
    g: 2,
    p: 1,
    h: 0,
    ps: 1,
    lt: 1,
  });
});

test("the share sentence names the challenge and claims only what the card's checks say", () => {
  const ev = {
    v: 1 as const,
    state: "merged" as const,
    checks: { passed: 15, total: 15, result: "checks-passed" as const },
    first: { passed: 5, total: 15, result: "checks-failed" as const },
    hidden: { passed: 10, total: 10 },
    changed: null,
    pushes: 2,
    runs: 3,
    testedBeforePush: "tested-passing" as const,
    failedPushes: 1,
    findings: { raised: 0, open: 0 },
    hints: 0,
    gaps: false,
  };
  const title = "The composer says 1 word when the post is empty";
  assert.equal(
    sentence({ ...card, ev }, "Go", title),
    `Completed “${title}” (GO-001) in Go. All 15 checks passed.`,
  );
  const partial = { ...ev, checks: { passed: 12, total: 15, result: "checks-failed" as const } };
  assert.equal(
    sentence({ ...card, ev: partial }, "Go"),
    "Completed GO-001 in Go. 12/15 checks passed.",
  );
  // A card says it was merged, or it is not described as completed at all.
  assert.equal(
    sentence({ ...card, ev: { ...ev, state: "open" } }, "Go"),
    "Worked on GO-001 in Go. Not completed.",
  );
  for (const text of [sentence(card, "Go"), sentence({ ...card, ev }, "Go", title)])
    assert.doesNotMatch(text, /merge|pull request|fix for|bug|without AI|faster|%/i);
});
