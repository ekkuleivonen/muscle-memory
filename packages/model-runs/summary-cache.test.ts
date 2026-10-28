import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readModelSummary,
  writeModelSummary,
  refreshModelSummaries,
  summaryKey,
  SUMMARY_MAX_AGE,
  SUMMARY_BYTES,
  type SummaryBucket,
} from "./summary-cache";
import type { ReceiptRead } from "./read-receipts";
const revision = `sha256:${"a".repeat(64)}`;
function storage() {
  const values = new Map<string, string>();
  const bucket: SummaryBucket = {
    get: async (key) => {
      const text = values.get(key);
      return text === undefined
        ? null
        : {
            size: new TextEncoder().encode(text).length,
            text: async () => text,
          };
    },
    put: async (key, value) => {
      values.set(key, value);
    },
  };
  return { bucket, values };
}
const result: ReceiptRead = {
  state: "ready",
  truncated: false,
  readAt: "2026-10-27T12:00:00Z",
  receipts: [],
};
test("a cold/expired snapshot stays unavailable instead of invoking a raw read", async () => {
  const { bucket } = storage();
  assert.equal(await readModelSummary(bucket, "JS-001", revision, 100), null);
  await writeModelSummary(bucket, "JS-001", revision, result, 100);
  assert.deepEqual(
    await readModelSummary(bucket, "JS-001", revision, 101),
    result,
  );
  assert.equal(
    await readModelSummary(bucket, "JS-001", revision, 100 + SUMMARY_MAX_AGE),
    null,
  );
  assert.equal(await readModelSummary(bucket, "JS-001", revision, 99), null);
  assert.equal(await readModelSummary(bucket, "JS-002", revision, 101), null);
});
test("a previous harness snapshot cannot be served after deployment", async () => {
  const { bucket, values } = storage();
  await writeModelSummary(bucket, "JS-001", revision, result, 100);
  const key = summaryKey("JS-001", revision);
  values.set(
    key,
    JSON.stringify({
      ...JSON.parse(values.get(key)!),
      harness: "previous-harness",
    }),
  );
  assert.equal(await readModelSummary(bucket, "JS-001", revision, 101), null);
});
test("snapshot projection never copies extra raw run fields", async () => {
  const { bucket, values } = storage();
  const receipt = {
    model: "synthetic",
    reportedModels: [],
    reasoning: "default",
    defaultReasoning: "default",
    finalCodeLength: 8,
    harness: "test",
    try: 1,
    state: "completed",
    submissions: 1,
    runtime: { javascript: "test" },
    features: [],
    budget: null,
    code: "PRIVATE_SENTINEL",
    messages: ["PRIVATE_SENTINEL"],
  };
  await writeModelSummary(
    bucket,
    "JS-001",
    revision,
    { ...result, receipts: [receipt as any] },
    100,
  );
  assert.ok(![...values.values()][0].includes("PRIVATE_SENTINEL"));
  assert.equal(
    (await readModelSummary(bucket, "JS-001", revision, 101))?.receipts[0]
      .finalCodeLength,
    8,
  );
});
test("failure/incomplete reads preserve a previous valid snapshot", async () => {
  const { bucket, values } = storage();
  await writeModelSummary(bucket, "JS-001", revision, result, 100);
  const before = [...values.values()][0];
  const receipt = await refreshModelSummaries(
    [{ challenge: "JS-001", revision }],
    bucket,
    async () => ({ ...result, truncated: true }),
  );
  assert.equal(receipt.failed, 1);
  assert.equal([...values.values()][0], before);
  const incomplete = await refreshModelSummaries(
    [{ challenge: "JS-001", revision }],
    bucket,
    async () => ({
      ...result,
      receipts: [{ state: "receipt-unavailable" } as any],
    }),
  );
  assert.equal(incomplete.failed, 1);
  assert.equal([...values.values()][0], before);
});
test("refresh is sequential and bounded without exposing query errors", async () => {
  const { bucket } = storage();
  let active = 0,
    peak = 0;
  const rows = ["JS-001", "JS-002"].map((challenge) => ({
    challenge,
    revision,
  }));
  const receipt = await refreshModelSummaries(rows, bucket, async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return result;
  });
  assert.equal(peak, 1);
  assert.equal(receipt.refreshed, 2);
  const timeout = await refreshModelSummaries(
    rows,
    bucket,
    () => new Promise(() => {}),
    { budgetMs: 10 },
  );
  assert.equal(timeout.refreshed, 0);
  // Whether the budget ends before or during the second read, nothing counts as refreshed and
  // every revision is accounted for as failed or not attempted.
  assert.equal(timeout.failed + timeout.remaining, rows.length);
  assert.ok(timeout.failed >= 1);
});
test("a stalled final write is bounded by the remaining invocation budget", async () => {
  const bucket: SummaryBucket = {
    get: async () => null,
    put: () => new Promise(() => {}),
  };
  const start = Date.now();
  const receipt = await refreshModelSummaries(
    [{ challenge: "JS-001", revision }],
    bucket,
    async () => result,
    { budgetMs: 20 },
  );
  assert.equal(receipt.failed, 1);
  assert.ok(
    Date.now() - start < 500,
    "the final put must not get a separate five-second budget",
  );
});
test("bad keys, duplicate catalog rows, corrupt and oversize objects fail closed", async () => {
  const { bucket, values } = storage();
  assert.throws(() => summaryKey("../../events", revision));
  await assert.rejects(
    refreshModelSummaries(
      Array(2).fill({ challenge: "JS-001", revision }),
      bucket,
      async () => result,
    ),
  );
  values.set(summaryKey("JS-001", revision), "{".repeat(SUMMARY_BYTES + 1));
  assert.equal(await readModelSummary(bucket, "JS-001", revision), null);
});
test("stalled reads cost one row each; rotation-first order reaches healthy rows past a stalled frontier", async () => {
  const { fairOrder } = await import("./summary-cache");
  const { bucket } = storage();
  const rows = Array.from({ length: 41 }, (_, i) => ({ challenge: `JS-${String(i + 1).padStart(3, "0")}`, revision }));
  const poison = new Set(rows.slice(0, 30).map((r) => r.challenge));
  const written = new Set<string>();
  for (let hour = 0; hour < 11; hour++) {
    const order = fairOrder(rows, (r) => r.challenge, new Map(), hour, 4);
    const counts = await refreshModelSummaries(
      order,
      bucket,
      async (challenge) => {
        if (poison.has(challenge)) return new Promise<never>(() => {});
        written.add(challenge);
        return result;
      },
      { budgetMs: 60, rowMs: 10 },
    );
    assert.equal(counts.attempted, counts.refreshed + counts.failed);
    assert.equal(counts.attempted + counts.remaining, order.length);
  }
  for (const r of rows.slice(30)) assert.ok(written.has(r.challenge), r.challenge);
});
test("counts are actual work: nothing started under a spent budget; a deadline after a read is a failure", async () => {
  const { bucket } = storage();
  const rows = ["JS-001", "JS-002"].map((challenge) => ({ challenge, revision }));
  const none = await refreshModelSummaries(rows, bucket, async () => result, { budgetMs: 0 });
  assert.deepEqual(none, { attempted: 0, refreshed: 0, failed: 0, remaining: 2 });
  let t = 0;
  const late = await refreshModelSummaries(
    rows,
    bucket,
    async () => {
      t += 100; // the read ends after the deadline
      return result;
    },
    { budgetMs: 50, now: () => t },
  );
  assert.deepEqual(late, { attempted: 1, refreshed: 0, failed: 1, remaining: 1 });
});
