import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Dashboard, ReportBody, StealthNotice } from "./stats";
import { buildReport } from "../../lib/report";
import { deriveAttempts } from "../../../../packages/developer-profile/derive";
import { trace } from "../../../../packages/developer-profile/fixtures";
import type { ChallengeSummary } from "../../lib/challenges";
import type { ModelReceipt } from "../../../../packages/model-runs/receipts";

const catalog = [
  {
    key: "JS-001",
    title: "Synthetic",
    language: "javascript",
    tags: ["arrays"],
    runnable: true,
  },
  {
    key: "JS-002",
    title: "Synthetic two",
    language: "javascript",
    tags: ["strings"],
    runnable: true,
  },
] as unknown as ChallengeSummary[];

test("stealth shows only what stealth means and where to change it", () => {
  const html = renderToStaticMarkup(createElement(StealthNotice));
  assert.match(html, /no report here/);
  assert.match(html, /\/settings\/privacy/);
  assert.doesNotMatch(
    html,
    /finished|submission|model\/|cohort|percentile|\d+\/\d+/i,
  );
  assert.doesNotMatch(
    html,
    /should|recommend|turn (it )?off/i,
    "no pressure to leave stealth",
  );
});

test("before privacy and storage are read, nothing private or zero-filled renders", () => {
  const html = renderToStaticMarkup(createElement(Dashboard, { catalog }));
  assert.match(html, /Reading your practice/);
  assert.doesNotMatch(html, /0\/0|finished|uploaded history|Load/);
});

test("the empty report leads with an invitation and a labelled preview", () => {
  const report = buildReport({
    catalog,
    progress: {},
    attempts: [],
    profile: null,
    receipts: {},
  });
  const html = renderToStaticMarkup(
    createElement(ReportBody, { report, status: null }),
  );
  assert.match(html, /Your report starts with one challenge/);
  assert.match(html, /href="\/start"/);
  assert.match(html, /sample data, not\s+yours/);
  assert.doesNotMatch(
    html,
    /UTC|Load uploaded history|developer-profile-2|sha256/,
  );
});

test("a rich report opens on a personal takeaway with chapters, visuals and evidence", () => {
  const attempts = deriveAttempts(trace(), "synthetic-participant").map(
    (a) => ({ ...a, source: "device" as const }),
  );
  const report = buildReport({
    catalog,
    progress: {
      "JS-001": {
        attempt: "synthetic-attempt",
        startedAt: "2026-10-27T10:00:00Z",
        completedAt: "2026-10-27T10:00:09Z",
        completions: 1,
      },
    },
    attempts,
    profile: null,
    receipts: { [attempts[0].revision]: "loading" },
  });
  const html = renderToStaticMarkup(
    createElement(ReportBody, { report, status: null }),
  );
  const first = html.indexOf("<h2");
  assert.ok(first > 0);
  assert.match(
    html.slice(first, first + 200),
    /You finished the challenge you started/,
  );
  assert.doesNotMatch(
    html,
    /How this was worked out|All measurements|Exact models, versions|sha256:|harness-1|sources|protocol/,
  );
  assert.match(html, /aria-label="Report chapters"/);
  assert.match(html, /chapter-story/);
  assert.match(html, /Checkpoints on JS-001, in order/);
  assert.match(html, /reading…/);
  assert.match(html, /not compared yet/);
  assert.doesNotMatch(html, /too few|not enough comparable/);
  assert.doesNotMatch(html, /UTC|developer-profile-2/);
});

test("narrow screens get one comparison card per challenge with every model outcome", () => {
  const attempts = deriveAttempts(trace(), "synthetic-participant").map(
    (a) => ({ ...a, source: "device" as const }),
  );
  const receipt = {
    model: "synthetic/model",
    reportedModels: ["synthetic/model-2026"],
    reasoning: "high",
    harness: "h",
    try: 1,
    state: "completed" as const,
    submissions: 1,
    runtime: { engine: "javascript", version: "synthetic" },
    features: [],
    budget: null,
    defaultReasoning: null,
    finalCodeLength: null,
  } as ModelReceipt;
  const report = buildReport({
    catalog,
    progress: {},
    attempts,
    profile: null,
    receipts: { [attempts[0].revision]: [receipt] },
  });
  const html = renderToStaticMarkup(
    createElement(ReportBody, { report, status: null }),
  );
  const cards = html.slice(html.indexOf('class="report-cards"'));
  assert.match(
    cards,
    /<dt>synthetic\/model · high<\/dt><dd><span class="report-result is-solved">/,
  );
  assert.match(
    cards,
    /<dt>People<\/dt><dd class="t-dim">not compared yet<\/dd>/,
  );
});

test("a matched model receipt renders real observed outcome, incompatible context withholds it", async () => {
  const { ModelReceiptView } = await import("./model-comparisons");
  const r = {
    model: "synthetic/model",
    reportedModels: ["synthetic/model-2026"],
    reasoning: "high",
    defaultReasoning: "high",
    finalCodeLength: null,
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

test("repeat history in the measurements appendix never invents growth", async () => {
  const { RepeatHistory } = await import("./appendix");
  const html = renderToStaticMarkup(
    createElement(RepeatHistory, {
      attempts: [],
      until: "2026-10-27T00:00:00Z",
    }),
  );
  assert.match(html, /playing more cannot\s+reconstruct/);
  assert.match(html, /External\s+assistance remains unknown/);
  assert.match(html, /not statistical confidence/);
});

test("partial practice offers Resume only when the browser can actually continue the attempt", () => {
  const attempts = deriveAttempts(
    trace().slice(0, 2),
    "synthetic-participant",
  ).map((a) => ({ ...a, source: "device" as const }));
  const progress = {
    "JS-001": {
      attempt: "synthetic-attempt",
      startedAt: "2026-10-27T10:00:00Z",
      completedAt: null,
      completions: 0,
    },
  };
  const input = { catalog, progress, attempts, profile: null, receipts: {} };
  const html = renderToStaticMarkup(
    createElement(ReportBody, { report: buildReport(input), status: null }),
  );
  assert.match(html, /Resume JS-001/);
  const noContinuation = renderToStaticMarkup(
    createElement(ReportBody, {
      report: buildReport({ ...input, progress: {} }),
      status: null,
    }),
  );
  assert.doesNotMatch(noContinuation, /Resume JS-001/);
});
