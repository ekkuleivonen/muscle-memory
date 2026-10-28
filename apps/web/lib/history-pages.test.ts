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

test("failed reads carry a fixed reason; only transient ones are retried", async () => {
  const { failureReason, retryable } = await import("./history-pages");
  assert.equal(failureReason(503, "storage-http-400"), "http-503:storage-http-400");
  assert.equal(failureReason(503, undefined), "http-503", "a 503 without diagnostic stays distinct");
  assert.equal(failureReason(503, "SELECT * FROM events"), "http-503", "free text never becomes a reason");
  assert.equal(failureReason(503, "x".repeat(60)), "http-503");
  for (const r of ["http-503:storage-http-400", "http-503", "http-502", "http-429", "timeout", "network", "identity"] as const)
    assert.equal(retryable(r), true, r);
  for (const r of ["http-401", "http-403", "http-410", "http-400", "http-413", "invalid-page"] as const)
    assert.equal(retryable(r), false, r);
});

test("pacing and the retry budget hold across report remounts in one tab", async () => {
  const { HistoryPacer } = await import("./history-pages");
  const pacer = new HistoryPacer(61_000); // one per tab, as report-data keeps it at module level
  let now = 1_000_000;
  // Mount 1 reads, fails with a 503 and schedules its retry at the interval.
  assert.equal(pacer.begin(now), true);
  assert.equal(pacer.retryAt("http-503:storage-http-400", now), now + 61_000);
  // A remount 5 s later can't read early: it waits for the same interval.
  now += 5_000;
  assert.equal(pacer.begin(now), false, "no read inside the interval after a remount");
  assert.equal(pacer.readyAt(now), 1_000_000 + 61_000);
  now = pacer.readyAt(now);
  assert.equal(pacer.begin(now), true);
  // Its failure uses the second, last automatic retry; a third remount gets none.
  assert.equal(pacer.retryAt("http-503", now), now + 61_000);
  now += 61_000;
  assert.equal(pacer.begin(now), true);
  assert.equal(pacer.retryAt("http-503", now), undefined, "remounting doesn't refill the budget");
  // Ownership refusals are never retried, budget or not.
  pacer.succeeded();
  assert.equal(pacer.retryAt("http-401", now), undefined);
  // Identity failures made no read, so they retry sooner and don't wait for the interval.
  assert.equal(pacer.retryAt("identity", now), now + 10_000);
});

/** A Response whose body sends `first`, then stalls until `signal` aborts, or errors. */
function streamed(first: string, end: "abort" | "error", signal?: AbortSignal) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(first));
      if (end === "error") controller.error(new TypeError("network connection lost"));
      else signal?.addEventListener("abort", () => controller.error(signal.reason), { once: true });
    },
  });
  return new Response(body, { status: 200 });
}

test("a slow or truncated history body stays a transient failure; only complete garbage is invalid-page", async () => {
  const { readPageBody, thrownReason } = await import("./history-pages");
  const reason = async (response: Response) => {
    try {
      await readPageBody(response);
      return "ok";
    } catch (error) {
      return thrownReason(error);
    }
  };
  // Truncated: the connection drops mid-body.
  assert.equal(await reason(streamed('{"state":"ready","attempts":[', "error")), "network");
  // Slow: the body stalls and the request's timeout fires.
  // Same reason AbortSignal.timeout gives; its own timer is unreferenced in Node, so fire it here.
  const slow = new AbortController();
  setTimeout(() => slow.abort(new DOMException("The operation timed out.", "TimeoutError")), 50);
  assert.equal(await reason(streamed('{"state":"ready"', "abort", slow.signal)), "timeout");
  // Aborted by a boundary: still transient (the caller then ignores it as no longer live).
  const controller = new AbortController();
  const aborted = reason(streamed('{"state":"ready"', "abort", controller.signal));
  controller.abort();
  assert.equal(await aborted, "network");
  // Complete bytes that aren't a page object are malformed.
  assert.equal(await reason(new Response("<html>gateway</html>")), "invalid-page");
  assert.equal(await reason(new Response("[1,2]")), "invalid-page");
  assert.equal(await reason(new Response('{"state":"ready","attempts":[],"unavailable":[],"next":null}')), "ok");
});

test("a 200 that fails validation never refills the automatic-retry budget; only a genuine page does", async () => {
  const { HistoryPacer, acceptPage } = await import("./history-pages");
  const pacer = new HistoryPacer(61_000);
  let now = 2_000_000;
  // Spend both automatic retries on transient failures.
  assert.ok(pacer.retryAt("http-503", now));
  assert.ok(pacer.retryAt("timeout", now));
  assert.equal(pacer.retryAt("http-503", now), undefined, "budget exhausted");
  // HTTP 200 with a JSON object that isn't a valid page: rejected before any refill.
  const malformed = { state: "ready", attempts: "not-a-list", unavailable: [], next: null } as never;
  assert.throws(() => acceptPage(pacer, null, malformed));
  now += 61_000;
  assert.equal(pacer.retryAt("network", now), undefined, "the malformed 200 didn't refill retries");
  // A genuine page does refill them.
  const page = { state: "ready", attempts: [], unavailable: [], next: null, readAt: "2026-10-28T00:00:00.000Z", window: { from: "2025-10-29", to: "2026-10-28", after: "" } } as never;
  acceptPage(pacer, null, page);
  assert.ok(pacer.retryAt("network", now), "a valid page restores automatic retries");
});
