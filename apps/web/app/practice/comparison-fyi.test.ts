import { test } from "node:test";
import assert from "node:assert/strict";
import { comparisonFyi } from "./comparison-fyi";
import { modelReceipt } from "../../../../packages/model-runs/receipts";
import {
  receiptText,
  slot,
} from "../../../../packages/model-runs/receipt-fixtures";
const conditions = [
  'Runtime: {"id":"browser-javascript","version":"3.35.1"}',
  "Editor: codemirror-6; features: syntax-highlighting",
];
const base = modelReceipt(
  slot,
  receiptText(),
  "JS-001",
  `sha256:${"a".repeat(64)}`,
);
const rows = [80, 100, 120].map((length, i) => ({
  ...base,
  model: `synthetic/model-${i}`,
  defaultReasoning: "high",
  finalCodeLength: length,
}));
test("one quiet FYI uses a successful default median, denominator and direction", () => {
  assert.equal(
    comparisonFyi(80, rows, conditions),
    "Your code is 20% shorter than the AI median (n=3).",
  );
  assert.equal(
    comparisonFyi(120, rows, conditions),
    "Your code is 20% longer than the AI median (n=3).",
  );
  assert.equal(
    comparisonFyi(
      80,
      [...rows, { ...rows[0], reasoning: "medium", finalCodeLength: 1 }],
      conditions,
    ),
    comparisonFyi(80, rows, conditions),
  );
  assert.equal(
    comparisonFyi(80, [...rows, rows[0]], conditions),
    comparisonFyi(80, rows, conditions),
  );
});
test("sparse, trivial, unavailable, partial and incompatible comparisons disappear", () => {
  for (const changed of [
    rows.slice(0, 2),
    rows.map((r) => ({ ...r, state: "error" as const })),
    rows.map((r) => ({ ...r, finalCodeLength: 0 })),
    rows.map((r) => ({ ...r, defaultReasoning: null })),
    rows.map((r) => ({ ...r, runtime: null })),
  ])
    assert.equal(comparisonFyi(80, changed, conditions), null);
  assert.equal(comparisonFyi(95, rows, conditions), null);
  assert.equal(comparisonFyi(null, rows, conditions), null);
  assert.equal(comparisonFyi(80, rows, conditions, true), null);
});
