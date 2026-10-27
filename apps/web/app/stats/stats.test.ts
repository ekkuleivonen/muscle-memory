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
