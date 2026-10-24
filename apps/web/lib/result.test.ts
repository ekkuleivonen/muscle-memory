import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeResult, encodeResult, resultOf, sentence, type Result } from "./result";

const card: Result = { k: "QUICK-4", l: "go", m: 6, r: 4, p: 1, h: 0, c: "ab12cd34ef56" };

test("a card survives its link, and anything we would not have made is refused", () => {
  const segment = encodeResult(card);
  assert.match(segment, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeResult(segment), card);
  for (const bad of [
    { ...card, k: "<script>" },
    { ...card, m: -1 },
    { ...card, m: 1.5 },
    { ...card, c: "Participant-ID" },
    { ...card, l: "x".repeat(40) },
  ])
    assert.equal(decodeResult(encodeResult(bad as Result)), null);
  assert.equal(decodeResult("not base64 json"), null);
  assert.equal(
    sentence(card, "Go"),
    "Fixed a real bug in Go without AI: 6 minutes, 4 test runs, no hints.",
  );
});

test("the numbers come from the records up to the merge", () => {
  let n = 0;
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 25, 10, minute)).toISOString();
  const record = (type: string, minute: number, data: Record<string, unknown> = {}, issue = "word-count-go") => ({
    recordId: `s.${++n}`,
    kind: "observation" as const,
    participantId: "p",
    payload: JSON.stringify({ type, issue, occurredAt: at(minute), data }),
  });
  const records = [
    record("observation.workspace.keys", 0),
    record("observation.workspace.edit", 0),
    record("observation.workspace.run", 1, { purpose: "local", status: "queued" }),
    record("observation.workspace.run", 1, { purpose: "local", status: "result" }),
    record("observation.workspace.hint", 2),
    record("observation.workspace.run", 3, { purpose: "pull-request", status: "result" }),
    record("observation.workspace.pull-request", 3),
    record("observation.workspace.edit", 9, {}, "another-issue"),
    // After the merge: not counted.
    record("observation.workspace.edit", 30),
  ];
  assert.deepEqual(resultOf(records, "word-count-go", at(5)), { m: 3, r: 1, p: 1, h: 1 });
});
