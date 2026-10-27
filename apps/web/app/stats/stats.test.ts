import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Comparison, Dashboard } from "./stats";
test("stealth hides every human/model comparison detail and context nudge", () => {
  const html = renderToStaticMarkup(
    createElement(Comparison, { stealth: true }),
  );
  assert.match(html, /comparisons are hidden/);
  assert.doesNotMatch(
    html,
    /cohort|ledger|model\/version|reasoning|profile answers|receipt/i,
  );
});
test("human and model availability never invent a baseline, probability or approved cohort threshold", () => {
  const html = renderToStaticMarkup(
    createElement(Comparison, { stealth: false }),
  );
  assert.match(html, /suppressed/);
  assert.match(html, /has not been approved/);
  assert.match(html, /single observed try/);
  assert.match(
    html,
    /stopped, budget-limited, refused and infrastructure-failed/,
  );
  assert.doesNotMatch(html, /percentile|success rate|10 participants/);
});
test("loading renders no zero placeholders for private metrics before mount", () => {
  const html = renderToStaticMarkup(createElement(Dashboard, { catalog: [] }));
  assert.match(html, /Reading local evidence/);
  assert.doesNotMatch(
    html,
    /0 challenges completed|median \/ attempt|0 retained/,
  );
});

test("repeat-history availability keeps longitudinal delivery explicit without inventing growth", async () => {
  const { RepeatHistory } = await import("./stats");
  const html = renderToStaticMarkup(
    createElement(RepeatHistory, {
      attempts: [],
      until: "2026-10-27T00:00:00Z",
    }),
  );
  assert.match(html, /Load uploaded history/);
  assert.match(html, /Playing more cannot reconstruct/);
  assert.match(html, /External assistance remains unknown/);
  assert.match(html, /not statistical confidence/);
});

test("a matched model receipt renders real observed outcome, incompatible context withholds it", async () => {
  const { ModelReceiptView } = await import("./model-comparisons");
  const r = {
    model: "synthetic/model",
    reportedModels: ["synthetic/model-2026"],
    reasoning: "high",
    harness: "harness-1",
    try: 1,
    state: "completed" as const,
    submissions: 2,
    runtime: { id: "synthetic", version: "1" },
    features: [],
    budget: { turns: 50, submissions: 10 },
  };
  const conditions = [
    'Runtime: {"id":"synthetic","version":"1"}',
    "Editor: codemirror-6; features: syntax-highlighting",
  ];
  const matched = renderToStaticMarkup(
    createElement(ModelReceiptView, { receipt: r, conditions }),
  );
  assert.match(matched, /Observed outcome: completed/);
  assert.match(matched, /2 submissions/);
  assert.match(matched, /synthetic\/model-2026/);
  const mismatch = renderToStaticMarkup(
    createElement(ModelReceiptView, { receipt: r, conditions: [] }),
  );
  assert.doesNotMatch(mismatch, /Observed outcome: completed/);
  assert.match(mismatch, /Outcome withheld/);
});
