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
  { key: "JS-001", title: "Synthetic", language: "javascript", tags: ["arrays"], runnable: true },
  { key: "JS-002", title: "Synthetic two", language: "javascript", tags: ["strings"], runnable: true },
] as unknown as ChallengeSummary[];

test("stealth shows only what stealth means and where to change it", () => {
  const html = renderToStaticMarkup(createElement(StealthNotice));
  assert.match(html, /no report here/);
  assert.match(html, /\/settings\/privacy/);
  assert.doesNotMatch(html, /finished|submission|model\/|cohort|percentile|\d+\/\d+/i);
  assert.doesNotMatch(html, /should|recommend|turn (it )?off/i, "no pressure to leave stealth");
});

test("before privacy and storage are read, nothing private or zero-filled renders", () => {
  const html = renderToStaticMarkup(createElement(Dashboard, { catalog }));
  assert.match(html, /Reading your practice/);
  assert.doesNotMatch(html, /0\/0|finished|uploaded history|Load/);
});

test("the empty report is one line and a start, with no preview cards", () => {
  const report = buildReport({ catalog, progress: {}, attempts: [], profile: null });
  const html = renderToStaticMarkup(createElement(ReportBody, { report, status: null }));
  assert.match(html, /Your portrait starts with one challenge/);
  assert.match(html, /href="\/start"/);
  assert.doesNotMatch(html, /sample data|report-question|<details/);
});

test("a portrait is questions with answers, never inventories, chapters or internals", () => {
  const attempts = deriveAttempts(trace(), "synthetic-participant").map((a) => ({ ...a, source: "device" as const }));
  const report = buildReport({
    catalog,
    progress: { "JS-001": { attempt: "synthetic-attempt", startedAt: "2026-10-27T10:00:00Z", completedAt: "2026-10-27T10:00:09Z", completions: 1 } },
    attempts,
    profile: null,
  });
  const html = renderToStaticMarkup(createElement(ReportBody, { report, status: null }));
  assert.match(html, /<h1[^>]*>How you code<\/h1>/);
  assert.match(html, /How soon do you start, and how long do you build\?/);
  assert.doesNotMatch(html, /How fast do you type/, "the fixture has no run of code characters, so typing is left out");
  assert.equal((html.match(/report-fyi/g) ?? []).length, 0, "no comparison: model and human submissions aren't the same unit");
  assert.doesNotMatch(
    html,
    /finished|unfinished|revisited|waiting|Could you still|chapter|Report chapters|evidence|sha256|[Rr]evision|harness|receipt|UTC|definition|withheld|mismatch|not compared|reading|thinking|<details|<table/,
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

test("a failed history read keeps its reason out of the copy and offers Try again only when no retry is pending", async () => {
  const { Status } = await import("./stats");
  const message = "Your uploads can't be read right now, so the report uses this device only.";
  const waiting = renderToStaticMarkup(
    createElement(Status, { history: { state: "unavailable", message, reason: "http-503:storage-http-400", retryAt: Date.now() + 61_000 }, onRetry: () => {} }),
  );
  assert.match(waiting, /data-history-reason="http-503:storage-http-400"/);
  assert.match(waiting, />Your earlier practice couldn&#x27;t be added yet; trying again shortly\.</);
  assert.doesNotMatch(waiting, />[^<]*(storage-http|503)[^<]*</, "the code is in an attribute, never in text");
  assert.doesNotMatch(waiting, /<button/);
  const exhausted = renderToStaticMarkup(
    createElement(Status, { history: { state: "limited", message, reason: "http-429" }, onRetry: () => {} }),
  );
  assert.match(exhausted, /this shows this device only\. <button type="button" class="t-cmd">Try again<\/button>/);
  const ready = renderToStaticMarkup(createElement(Status, { history: { state: "unauthorized", message } }));
  assert.equal(ready, "", "ownership refusal shows nothing and offers no retry");
});

test("takeaways lead the report as links to the answers they sum up, and stay out of an empty one", () => {
  const report = { ...buildReport({ catalog, progress: {}, attempts: [], profile: null }), empty: false };
  const none = renderToStaticMarkup(createElement(ReportBody, { report, status: null }));
  assert.doesNotMatch(none, /report-takeaways/);
  const withLead = renderToStaticMarkup(
    createElement(ReportBody, { report: { ...report, takeaways: [{ id: "progress", text: "Faster at easy JavaScript lately: 11 min → 6 min of active work per solve." }] }, status: null }),
  );
  assert.match(withLead, /<ul class="report-takeaways" aria-label="Takeaways"><li><a href="#q-progress">Faster at easy JavaScript lately/);
});
