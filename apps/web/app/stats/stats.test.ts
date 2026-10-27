import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Dashboard, ReportBody, StealthNotice } from "./stats";
import { buildReport } from "../../lib/report";
import { deriveAttempts } from "../../../../packages/developer-profile/derive";
import { trace } from "../../../../packages/developer-profile/fixtures";
import type { ChallengeSummary } from "../../lib/challenges";

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

test("the empty report leads with an invitation and a labelled preview", () => {
  const report = buildReport({ catalog, progress: {}, attempts: [], profile: null, receipts: {} });
  const html = renderToStaticMarkup(createElement(ReportBody, { report, status: null }));
  assert.match(html, /Your report starts with one challenge/);
  assert.match(html, /href="\/start"/);
  assert.match(html, /sample data, not\s+yours/);
  assert.doesNotMatch(html, /UTC|Load uploaded history|developer-profile-2|sha256/);
});

test("a rich report opens on a personal takeaway with chapters, visuals and evidence", () => {
  const attempts = deriveAttempts(trace(), "synthetic-participant").map((a) => ({ ...a, source: "device" as const }));
  const report = buildReport({
    catalog,
    progress: { "JS-001": { attempt: "synthetic-attempt", startedAt: "2026-10-27T10:00:00Z", completedAt: "2026-10-27T10:00:09Z", completions: 1 } },
    attempts,
    profile: null,
    receipts: { [attempts[0].revision]: "loading" },
  });
  const html = renderToStaticMarkup(createElement(ReportBody, { report, status: null }));
  const first = html.indexOf("<h2");
  assert.ok(first > 0);
  assert.match(html.slice(first, first + 200), /You finished the challenge you started/);
  assert.ok(html.indexOf("You finished") < html.indexOf("How this was worked out"), "takeaway before method");
  assert.match(html, /aria-label="Report chapters"/);
  assert.match(html, /chapter-story/);
  assert.match(html, /Checkpoints on JS-001, in order/);
  assert.match(html, /reading…/);
  assert.match(html, /too few yet/);
  assert.doesNotMatch(html, /UTC|developer-profile-2/);
});
