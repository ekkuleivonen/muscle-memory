import { test } from "node:test";
import assert from "node:assert/strict";
import { reportRead, reportReceipts } from "./report-reads";

test("a hung read including body/identity access settles and cancels; parent cancellation also settles", async () => {
  let signal!: AbortSignal;
  await assert.rejects(
    reportRead(
      async (s) => {
        signal = s;
        return new Promise(() => {});
      },
      undefined,
      10,
    ),
    /unavailable/,
  );
  assert.equal(signal.aborted, true);
  const parent = new AbortController();
  const read = reportRead(() => new Promise(() => {}), parent.signal);
  parent.abort();
  await assert.rejects(read, /unavailable/);
});

test("three receipt keys never exceed two active reads; transient capacity gets only one retry", async () => {
  let active = 0,
    peak = 0;
  const calls = new Map<number, number>();
  await reportReceipts(
    [1, 2, 3],
    async (n) => {
      active++;
      peak = Math.max(peak, active);
      calls.set(n, (calls.get(n) ?? 0) + 1);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return n !== 3;
    },
    new AbortController().signal,
  );
  assert.equal(peak, 2);
  assert.deepEqual(
    [...calls],
    [
      [1, 1],
      [2, 1],
      [3, 2],
    ],
  );
});

test("cancelled receipt batches never start queued keys or retries", async () => {
  const parent = new AbortController();
  const called: number[] = [];
  await reportReceipts(
    [1, 2, 3],
    async (n) => {
      called.push(n);
      parent.abort();
      return false;
    },
    parent.signal,
  );
  assert.deepEqual(called, [1]);
});
