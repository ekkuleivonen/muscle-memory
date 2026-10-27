import { test } from "node:test";
import assert from "node:assert/strict";
import { HARNESS_VERSION } from "./tools";
import { modelReceipt, receiptMatch, RECEIPT_BYTES } from "./receipts";
import { readModelReceipts } from "./read-receipts";
import { slot, receiptText } from "./receipt-fixtures";
const revision = `sha256:${"a".repeat(64)}`;
const conditions = [
  'Runtime: {"id":"browser-javascript","version":"3.35.1"}',
  "Editor: codemirror-6; features: javascript-syntax-highlighting, undo-redo-history",
];
test("verified receipt projects observed outcome, exact reported ID, reasoning and protocol without private payloads", () => {
  const receipt = modelReceipt(slot, receiptText(), "JS-001", revision);
  assert.equal(receipt.state, "completed");
  assert.deepEqual(receipt.reportedModels, ["synthetic/model-2026-10-27"]);
  assert.equal(receipt.reasoning, "high");
  assert.equal(receipt.submissions, 1);
  assert.equal(receiptMatch(receipt, conditions), "matched");
  assert.doesNotMatch(
    JSON.stringify(receipt),
    /SYNTHETIC_PRIVATE_CODE|NEVER_PUBLIC|systemPrompt|message|participant|run_id/,
  );
});
test("model missing, stopped, budget, refused, provider error and harness failures remain distinct", () => {
  assert.equal(modelReceipt(slot, null, "JS-001", revision).state, "missing");
  for (const outcome of ["stopped", "budget", "refused", "error"]) {
    const r = modelReceipt(
      { ...slot, outcome },
      receiptText((os) => {
        os.find((o) => o.type === "model.ended").data.outcome = outcome;
      }),
      "JS-001",
      revision,
    );
    assert.equal(r.state, outcome);
  }
  for (const [status, state] of [
    ["queued", "queued"],
    ["running", "running"],
    ["harness-failed", "infrastructure-failed"],
  ] as const)
    assert.equal(
      modelReceipt({ ...slot, status }, null, "JS-001", revision).state,
      state,
    );
});
test("exact revision, protocol, source gaps/conflicts and tool/diagnostic/runtime conditions are verified", () => {
  assert.equal(
    modelReceipt(slot, receiptText(), "JS-002", revision).state,
    "incompatible",
  );
  for (const change of [
    (os: any[]) => (os[0].data.systemPrompt = "wrong"),
    (os: any[]) => (os[0].data.request.reasoning.effort = "low"),
    (os: any[]) => (os[1].source.sequence = 42),
    (os: any[]) => (os[2].actor = "person"),
    (os: any[]) => (os[3].data.runtime.privateCode = "NEVER_PUBLIC"),
    (os: any[]) => os.push({ ...os[0], data: { ...os[0].data, try: 99 } }),
  ])
    assert.equal(
      modelReceipt(slot, receiptText(change), "JS-001", revision).state,
      "incompatible",
    );
  const r = modelReceipt(slot, receiptText(), "JS-001", revision);
  assert.equal(
    receiptMatch(r, [
      'Runtime: {"id":"different","version":"1"}',
      conditions[1],
    ]),
    "runtime-mismatch",
  );
  assert.equal(
    receiptMatch(r, [conditions[0], conditions[1] + ", type-diagnostics"]),
    "diagnostics-mismatch",
  );
  assert.equal(receiptMatch(r, []), "unknown-context");
});
test("read transport checks fixed subject/query and both R2 locations, never mutates or returns raw data", async () => {
  const keys: string[] = [];
  const body = receiptText();
  const db = {
    all: async <T>(sql: string, args?: readonly unknown[]) => {
      assert.doesNotMatch(sql, /reason,|harness_error|SELECT \*/);
      assert.deepEqual(args, ["JS-001", revision, HARNESS_VERSION]);
      return [slot] as T[];
    },
    run: async () => {
      throw new Error("Mutation forbidden");
    },
  };
  const result = await readModelReceipts(
    db,
    {
      get: async (key) => {
        keys.push(key);
        return key.includes("/outbox/")
          ? { size: body.length, body: new Response(body).body! }
          : null;
      },
    },
    "JS-001",
    revision,
  );
  assert.deepEqual(keys, [
    "model-runs/stored/synthetic-run.ndjson",
    "model-runs/outbox/synthetic-run.ndjson",
  ]);
  assert.equal(result.receipts[0].state, "completed");
  assert.doesNotMatch(
    JSON.stringify(result),
    /SYNTHETIC_PRIVATE_CODE|NEVER_PUBLIC/,
  );
  const oversized = await readModelReceipts(
    db,
    {
      get: async () => ({
        size: RECEIPT_BYTES + 1,
        body: new Response("x").body!,
      }),
    },
    "JS-001",
    revision,
  );
  assert.equal(oversized.receipts[0].state, "receipt-unavailable");
});

test("slow database/receipt reads have a real wall-clock deadline; no late receipt is returned", async () => {
  const db = {
    all: async <T>() => [slot] as T[],
    run: async () => ({ changes: 0 }),
  };
  let cancelled = false;
  const result = await readModelReceipts(
    db,
    {
      get: async () => ({
        size: 1,
        body: new ReadableStream<Uint8Array>({
          cancel() {
            cancelled = true;
          },
        }),
      }),
    },
    "JS-001",
    revision,
    10,
  );
  assert.equal(result.receipts[0].state, "receipt-unavailable");
  assert.equal(cancelled, true);
  await assert.rejects(
    readModelReceipts(
      { all: () => new Promise(() => {}), run: db.run },
      { get: async () => null },
      "JS-001",
      revision,
      5,
    ),
  );
});
