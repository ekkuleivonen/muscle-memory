import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AttemptSummary } from "../../../../packages/developer-profile/derive";
import { cohortResult, MIN_COHORT, type CohortRead } from "../../../../packages/statistics/cohort";
import { AGE_FORM, humanFyi, PRIVACY_SETTINGS, type HumanFyiReason } from "../../../../packages/statistics/human-fyi";
import { MIN_MODELS, modelFyi, type ModelFyiReason } from "../../../../packages/model-runs/stats-fyi";
import type { ModelReceipt } from "../../../../packages/model-runs/receipts";
import { buildReport, type ReportAttempt } from "../../lib/report";
import type { ChallengeSummary } from "../../lib/challenges";
import type { StoredProfile } from "../../lib/profile";
import { comparisonRequests, comparisons, NO_COMPARISONS, pairKey } from "./comparisons";
import { ReportBody } from "./stats";

// Synthetic only: a fixture attempt, aggregated cohort rows and model receipts shaped like ENG-376's tests.
const revision = `sha256:${"a".repeat(64)}`;
const runtime = { id: "javascript", version: "synthetic" };
const editor = { name: "CodeMirror", features: ["syntax-highlighting", "type-diagnostics"] };
const catalog = [
  { key: "JS-001", revision, title: "Synthetic Sum", language: "javascript", difficulty: "easy", tags: [], runnable: true },
] as unknown as ChallengeSummary[];
const attempt = {
  version: "synthetic",
  participant: "synthetic-viewer",
  attempt: "a1",
  challenge: "JS-001",
  revision,
  started: "2026-10-27T00:00:00Z",
  last: "2026-10-27T00:10:00Z",
  completed: true,
  practice: "first",
  issues: [],
  values: { firstEdit: 1000, activeToSolve: 60_000, firstSubmit: 0 },
  answers: {},
  timeline: [
    { at: "2026-10-27T00:00:00Z", label: "started" },
    { at: "2026-10-27T00:05:00Z", label: "submit: result" },
    { at: "2026-10-27T00:05:00Z", label: "failed: 1/3 checks; 0 static rules" },
    { at: "2026-10-27T00:09:00Z", label: "submit: result" },
    { at: "2026-10-27T00:09:00Z", label: "passed: 3/3 checks; 0 static rules" },
    { at: "2026-10-27T00:09:00Z", label: "completed" },
  ],
  conditions: [`Editor: ${editor.name}; features: ${editor.features.join(", ")}`, `Runtime: ${JSON.stringify(runtime)}`],
  source: "device",
} as unknown as ReportAttempt;
const cohort = (passed: number, failed: number): CohortRead =>
  cohortResult(
    [
      [1, passed],
      [0, failed],
    ].map(([first_pass, browsers]) => ({ runtime: JSON.stringify(runtime), editor: JSON.stringify(editor), diagnostics: 1, practice: "first", completed: 1, first_pass, submissions: 2, browsers })),
  );
const receipt = (model: string, over: Partial<ModelReceipt> = {}): ModelReceipt => ({
  model,
  reportedModels: [model],
  reasoning: "default",
  defaultReasoning: "default",
  finalCodeLength: 100,
  harness: "synthetic",
  try: 1,
  state: "completed",
  submissions: 1,
  runtime,
  features: ["edit-code-tool", "type-diagnostics"],
  budget: { turns: 50, submissions: 10 },
  ...over,
});
const stored = (age?: string): StoredProfile =>
  ({ version: "2", createdAt: "2026-10-20T00:00:00Z", stealth: false, profile: age ? { age } : {} }) as StoredProfile;
const report = (human: ReturnType<typeof humanFyi>, model: ReturnType<typeof modelFyi>) =>
  buildReport({ catalog, progress: {}, attempts: [attempt], profile: null, comparisons: { human, model } });
const omitted = <R extends string>(reason: R) => ({ state: "omitted" as const, reason });

test("off by default: nothing is requested and each line says what it waits on", () => {
  assert.equal(process.env.NEXT_PUBLIC_STATS_COMPARISON_PREVIEW, undefined);
  assert.deepEqual(comparisonRequests([attempt], catalog), NO_COMPARISONS, "no cohort, receipt or code-length read");
  const c = comparisons([attempt], catalog, stored("25-34"), NO_COMPARISONS, { cohorts: {}, receipts: {}, lengths: {} });
  assert.deepEqual(c, { human: omitted("off"), model: omitted("off") });
  const r = buildReport({ catalog, progress: {}, attempts: [attempt], profile: null, comparisons: c });
  assert.deepEqual(r.comparisons, []);
  assert.equal(r.comparisonNotes.length, 2);
});

test("every omission reason reads as its real prerequisite, thresholds from the helpers' own exports", () => {
  const human = (reason: HumanFyiReason) => report(omitted(reason), omitted("loading")).comparisonNotes;
  assert.deepEqual(human("age-missing"), [{ text: "Other players: comparisons are between adults.", action: { label: "Add your age band (optional)", href: AGE_FORM } }]);
  assert.deepEqual(human("not-adult"), [], "16–17: nothing, and no prompt");
  assert.deepEqual(human("loading"), [], "nothing while a read is in flight");
  assert.match(human("too-few")[0].text, new RegExp(`at least ${MIN_COHORT} comparable adults`));
  assert.deepEqual(human("too-few")[0].action, { label: "Check your comparison settings", href: PRIVACY_SETTINGS }, "local age alone isn't being counted");
  assert.equal(human("unavailable")[0].text, "Other players' results aren't available right now.");
  assert.match(human("no-attempt")[0].text, /first attempts on a challenge's current version/);
  const model = (reason: ModelFyiReason) => report(omitted("loading"), omitted(reason)).comparisonNotes.map((n) => n.text);
  assert.match(model("too-few")[0], new RegExp(`fewer than ${MIN_MODELS} models`));
  assert.match(model("unmatched")[0], /same runtime and diagnostics setting/);
  assert.match(model("unavailable")[0], /aren't available right now/);
  assert.deepEqual(model("loading"), []);
  for (const r of ["off", "no-attempt", "unavailable", "unmatched", "too-few"] as const)
    assert.doesNotMatch(model(r).join(" "), /not comparable|can't be compared|never|latency|faster|smarter|submissions/i);
});

test("eligible lines show the helpers' own text, one each, under the answers and apart from them", () => {
  const human = humanFyi([attempt], catalog, { age: "25-34" }, [{ challenge: "JS-001", revision, read: cohort(9, 11) }], true);
  const model = modelFyi([attempt], catalog, {}, [{ challenge: "JS-001", revision, receipts: [receipt("m/a", { finalCodeLength: 90 }), receipt("m/b", { finalCodeLength: 120 }), receipt("m/c", { finalCodeLength: 300 })] }], { a1: 412 });
  assert.equal(human.state, "shown");
  assert.equal(model.state, "shown");
  const r = report(human, model);
  assert.deepEqual(r.comparisons.map((c) => [c.who, c.label]), [["human", "Other players"], ["model", "AI models"]]);
  assert.equal(r.comparisons[0].text, human.state === "shown" ? human.fyi.text : "");
  assert.equal(r.comparisons[1].text, model.state === "shown" ? model.fyi.text : "");
  assert.deepEqual(r.comparisonNotes, []);
  const html = renderToStaticMarkup(createElement(ReportBody, { report: r, status: null }));
  const at = html.indexOf('class="report-compared"');
  assert.ok(at > html.lastIndexOf('id="q-'), "after every answer, never inside one");
  const list = html.slice(at, html.indexOf("</ul>", at));
  assert.match(list, /On Synthetic Sum \(current version, same runtime and editor setup\), about 45% of scored first submissions passed, across first attempts from 20–49 browsers\./);
  assert.match(list, /your passing code was 412 characters; 3 of 3 models solved it/);
  assert.doesNotMatch(list, /Across your|didn&#x27;t pass|first submission passed in/i, "never beside the player's own first-submission figures");
});

test("each read is bound to the exact pair that asked; another revision's read is never used", () => {
  process.env.NEXT_PUBLIC_STATS_COMPARISON_PREVIEW = "1";
  try {
    const requests = comparisonRequests([attempt], catalog);
    assert.deepEqual(requests.cohorts, [{ challenge: "JS-001", revision }]);
    assert.deepEqual(requests.lengths, [{ challenge: "JS-001", revision, attempt: "a1" }], "lengths asked by attempt; numbers come back");
    const key = pairKey({ challenge: "JS-001", revision });
    const other = pairKey({ challenge: "JS-001", revision: `sha256:${"b".repeat(64)}` });
    const read = (cohorts: Record<string, CohortRead | "unavailable">) =>
      comparisons([attempt], catalog, stored("25-34"), requests, { cohorts, receipts: {}, lengths: {} }).human;
    assert.deepEqual(read({ [other]: cohort(9, 11) }), omitted("loading"), "a different revision's read stays unused");
    assert.equal(read({ [key]: cohort(9, 11) }).state, "shown");
    assert.deepEqual(read({ [key]: "unavailable" }), omitted("unavailable"));
    assert.deepEqual(read({ [key]: cohort(5, 5) }), omitted("too-few"));
    assert.deepEqual(comparisons([attempt], catalog, { ...stored("25-34"), stealth: true }, requests, { cohorts: { [key]: cohort(9, 11) }, receipts: {}, lengths: {} }).human, omitted("off"), "stealth: nothing");
    assert.deepEqual(comparisons([attempt], catalog, stored(), requests, { cohorts: { [key]: cohort(9, 11) }, receipts: {}, lengths: {} }).human, omitted("age-missing"));
  } finally {
    delete process.env.NEXT_PUBLIC_STATS_COMPARISON_PREVIEW;
  }
});

test("two solves of one challenge revision share one receipt read; the model line still shows", () => {
  process.env.NEXT_PUBLIC_STATS_COMPARISON_PREVIEW = "1";
  try {
    const again = (id: string, last: string) => ({ ...attempt, attempt: id, practice: "repeat", last }) as ReportAttempt;
    const twice = [again("r1", "2026-10-27T00:10:00Z"), again("r2", "2026-10-28T00:10:00Z")];
    const requests = comparisonRequests(twice, catalog);
    assert.deepEqual(requests.receipts, [{ challenge: "JS-001", revision }], "one read for the pair");
    assert.deepEqual(requests.lengths.map((l) => l.attempt), ["r2", "r1"], "lengths still per attempt");
    const key = pairKey({ challenge: "JS-001", revision });
    const read = { cohorts: {}, receipts: { [key]: [receipt("m/a"), receipt("m/b"), receipt("m/c")] }, lengths: {} };
    assert.equal(comparisons([twice[0]], catalog, stored("25-34"), comparisonRequests([twice[0]], catalog), read).model.state, "shown", "one repeat");
    assert.equal(comparisons(twice, catalog, stored("25-34"), requests, read).model.state, "shown", "two repeats of the same pair");
  } finally {
    delete process.env.NEXT_PUBLIC_STATS_COMPARISON_PREVIEW;
  }
});
