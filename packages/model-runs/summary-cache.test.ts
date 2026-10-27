import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readModelSummary, writeModelSummary, refreshModelSummaries, summaryKey,
  SUMMARY_MAX_AGE, SUMMARY_BYTES, type SummaryBucket,
} from "./summary-cache";
import type { ReceiptRead } from "./read-receipts";
const revision = `sha256:${"a".repeat(64)}`;
function storage() {
  const values = new Map<string, string>();
  const bucket: SummaryBucket = {
    get: async key => {
      const text = values.get(key);
      return text === undefined ? null : { size: new TextEncoder().encode(text).length, text: async () => text };
    },
    put: async (key, value) => { values.set(key, value); },
  };
  return { bucket, values };
}
const result: ReceiptRead = { state: "ready", truncated: false, readAt: "2026-10-27T12:00:00Z", receipts: [] };
test("a cold/expired snapshot stays unavailable instead of invoking a raw read", async () => {
  const { bucket } = storage();
  assert.equal(await readModelSummary(bucket, "JS-001", revision, 100), null);
  await writeModelSummary(bucket, "JS-001", revision, result, 100);
  assert.deepEqual(await readModelSummary(bucket, "JS-001", revision, 101), result);
  assert.equal(await readModelSummary(bucket, "JS-001", revision, 100 + SUMMARY_MAX_AGE), null);
  assert.equal(await readModelSummary(bucket, "JS-001", revision, 99), null);
  assert.equal(await readModelSummary(bucket, "JS-002", revision, 101), null);
});
test("snapshot projection never copies extra raw run fields", async () => {
  const { bucket, values } = storage();
  const receipt = {
    model: "synthetic", reportedModels: [], reasoning: "default", defaultReasoning: "default",
    finalCodeLength: 8, harness: "test", try: 1, state: "completed", submissions: 1,
    runtime: { javascript: "test" }, features: [], budget: null,
    code: "PRIVATE_SENTINEL", messages: ["PRIVATE_SENTINEL"],
  };
  await writeModelSummary(bucket, "JS-001", revision, { ...result, receipts: [receipt as any] }, 100);
  assert.ok(![...values.values()][0].includes("PRIVATE_SENTINEL"));
  assert.equal((await readModelSummary(bucket, "JS-001", revision, 101))?.receipts[0].finalCodeLength, 8);
});
test("failure/incomplete reads preserve a previous valid snapshot", async () => {
  const { bucket, values } = storage();
  await writeModelSummary(bucket, "JS-001", revision, result, 100);
  const before = [...values.values()][0];
  const receipt = await refreshModelSummaries([{ challenge: "JS-001", revision }], bucket,
    async () => ({ ...result, truncated: true }));
  assert.equal(receipt.failed, 1);
  assert.equal([...values.values()][0], before);
});
test("refresh is sequential and bounded without exposing query errors", async () => {
  const { bucket } = storage(); let active = 0, peak = 0;
  const rows = ["JS-001", "JS-002"].map(challenge => ({ challenge, revision }));
  const receipt = await refreshModelSummaries(rows, bucket, async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2)); active--; return result;
  });
  assert.equal(peak, 1); assert.equal(receipt.refreshed, 2);
  const timeout = await refreshModelSummaries(rows, bucket, () => new Promise(() => {}), { budgetMs: 10 });
  assert.equal(timeout.refreshed, 0); assert.ok(timeout.remaining >= 1);
});
test("bad keys, duplicate catalog rows, corrupt and oversize objects fail closed", async () => {
  const { bucket, values } = storage();
  assert.throws(() => summaryKey("../../events", revision));
  await assert.rejects(refreshModelSummaries(Array(2).fill({ challenge: "JS-001", revision }), bucket, async () => result));
  values.set(summaryKey("JS-001", revision), "{".repeat(SUMMARY_BYTES + 1));
  assert.equal(await readModelSummary(bucket, "JS-001", revision), null);
});
