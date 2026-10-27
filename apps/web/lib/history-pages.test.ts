import test from "node:test";
import assert from "node:assert/strict";
import { mergeHistoryPage } from "./history-pages";
import { deriveAttempts } from "../../../packages/developer-profile/derive";
import { trace } from "../../../packages/developer-profile/fixtures";
import type { UploadedHistory } from "../../../packages/developer-profile/uploaded-history";
const attempt = (n: number) =>
  deriveAttempts(trace("attempt-" + n, "source-" + n), "synthetic-participant")[0];
const page = (numbers: number[], next: string | null): UploadedHistory => ({
  attempts: numbers.map(attempt),
  unavailable: [],
  next,
  readAt: "2026-10-27T12:00:00Z",
  state: "ready",
  window: { from: "2026-10-01", to: "2026-10-27", after: "" },
});
test("more than five attempts accumulate; repeats and duplicate exact revisions count correctly", () => {
  let value: UploadedHistory | null = null;
  for (const p of [
    page([1, 2, 3, 4, 5], "05"),
    page([5, 6, 7, 8, 9], "09"),
    page([10, 11, 12], null),
  ])
    value = mergeHistoryPage(value, p).value;
  assert.equal(value!.attempts.length, 12);
  assert.equal(value!.next, null);
  assert.equal(new Set(value!.attempts.map((a) => a.attempt)).size, 12);
});
test("a repeated or backward cursor stops progression while preserving earlier evidence", () => {
  const previous = page([1, 2, 3, 4, 5], "05");
  for (const cursor of ["05", "04"]) {
    const result = mergeHistoryPage(previous, page([6], cursor));
    assert.equal(result.value.attempts.length, 6);
    assert.equal(result.value.next, null);
    assert.match(result.notice!, /could not/);
  }
});
test("resolved unavailable attempt is replaced by evidence; real missing attempts remain explicit", () => {
  const previous = page([1], "01");
  previous.unavailable = [
    { attempt: attempt(2).attempt, last: "now", reason: "incomplete" },
    { attempt: "missing", last: "now", reason: "incomplete" },
  ];
  const result = mergeHistoryPage(previous, page([2], null));
  assert.equal(result.value.attempts.length, 2);
  assert.deepEqual(
    result.value.unavailable.map((a) => a.attempt),
    ["missing"],
  );
});
test("the 100-attempt bound counts unavailable slots and never silently claims full coverage", () => {
  const previous = page(
    Array.from({ length: 98 }, (_, i) => i),
    "098",
  );
  const result = mergeHistoryPage(previous, page([98, 99, 100], "101"));
  assert.equal(result.value.attempts.length, 100);
  assert.equal(result.value.next, null);
  assert.match(result.notice!, /100/);
});
