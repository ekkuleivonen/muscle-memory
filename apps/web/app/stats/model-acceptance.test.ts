/**
 * The AI comparison line through Stats, on the real producers only: the viewer's attempts from
 * capture records (trace → localHistory), model results from the real receipt projector
 * (`modelReceipt` over a stored-run text), then the Stats bridge and the rendered report.
 * Synthetic data only; no model call. MODEL_FYI_ENABLED is on in source; these tests also set the
 * development preview switch the bridge already honours.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { trace, syntheticRevision as revision } from "../../../../packages/developer-profile/fixtures";
import { localHistory } from "../../../../packages/developer-profile/history";
import { onRevision } from "../../../../packages/statistics/human-acceptance-fixture";
import { canonical } from "../../../../packages/domain/json";
import { modelReceipt, type ModelReceipt } from "../../../../packages/model-runs/receipts";
import { receiptText, slot } from "../../../../packages/model-runs/receipt-fixtures";
import { buildReport, type ReportAttempt } from "../../lib/report";
import type { ChallengeSummary } from "../../lib/challenges";
import type { StoredProfile } from "../../lib/profile";
import { comparisonRequests, comparisons, MODEL_FYI_ENABLED, pairKey } from "./comparisons";
import { ReportBody } from "./stats";

process.env.NEXT_PUBLIC_STATS_COMPARISON_PREVIEW = "1";
/** The stored run's recorded runtime (receipt fixture): the viewer's attempts use the same. */
const runtime = { id: "browser-javascript", version: "3.35.1" };
const catalog = [
  { key: "JS-001", revision, title: "Synthetic Sum", language: "javascript", difficulty: "easy", tags: [], runnable: true },
  { key: "JS-002", revision, title: "Synthetic Pairs", language: "javascript", difficulty: "easy", tags: [], runnable: true },
] as unknown as ChallengeSummary[];
const viewer = { version: "2", createdAt: "2026-10-20T00:00:00Z", stealth: false, profile: {} } as unknown as StoredProfile;

/** Two solved tasks from the real producer. JS-002 is the newer one (its attempt sorts first). */
function attempts(): ReportAttempt[] {
  const solve = (attempt: string, challenge: string) =>
    trace(attempt, `${attempt}-source`, challenge, revision).map((r) => onRevision(r, revision, runtime));
  return localHistory({
    settings: { participantId: "synthetic-participant" },
    records: [...solve("b-js001", "JS-001"), ...solve("a-js002", "JS-002")],
    outbox: [],
  }).map((a) => ({ ...a, source: "device" as const }));
}

/** A stored run through the real projector, at `effort`, with the model's run-start listing. */
function stored(effort: string, declaredDefault: string | null, model = slot.model, answeredBy = slot.model): ModelReceipt {
  const projected = modelReceipt(
    { ...slot, condition: canonical({ reasoning: effort }) },
    receiptText((os) => {
      // The model that actually answered, as the provider reported it.
      for (const o of os) if (o.type === "model.response") o.data.model = answeredBy;
      const start = os.find((o) => o.type === "model.run-started");
      start.data.request = { model: slot.model, ...(effort === "default" ? {} : { reasoning: { effort } }) };
      const last = os.filter((o) => o.type.startsWith("model.")).at(-1);
      os.push({
        ...last,
        type: "model.catalog",
        observationId: `${last.source.id}.${last.source.sequence + 1}`,
        source: { ...last.source, sequence: last.source.sequence + 1 },
        data: { at: "start", listing: { status: 200, entry: { id: slot.model, reasoning: { default_effort: declaredDefault } } } },
      });
    }),
    "JS-001",
    revision,
  );
  assert.equal(projected.state, "completed", "the projector accepted the stored run");
  // A second model is the same validated run under another name (the fixture has one model id).
  return model === slot.model ? projected : { ...projected, model, reportedModels: [model] };
}

/** What Stats shows for these receipt reads, through the bridge and the report. */
function stats(receipts: Record<string, ModelReceipt[] | "unavailable">, profile = viewer) {
  const list = attempts();
  const requests = comparisonRequests(list, catalog);
  const c = comparisons(list, catalog, profile, requests, { cohorts: {}, receipts, lengths: {} });
  const report = buildReport({ catalog, progress: {}, attempts: list, profile: profile.profile, comparisons: c });
  return { requests, model: c.model, html: renderToStaticMarkup(createElement(ReportBody, { report, status: null })) };
}
const key1 = pairKey({ challenge: "JS-001", revision });
const key2 = pairKey({ challenge: "JS-002", revision });

test("the model line is on in source (owner-approved activation)", () => {
  assert.equal(MODEL_FYI_ENABLED, true);
});

test("per challenge: a newer task with no stored runs doesn't hide an older task's matching run", () => {
  const list = attempts();
  assert.deepEqual(list.map((a) => [a.challenge, a.practice]).sort(), [["JS-001", "unknown"], ["JS-002", "unknown"]]);
  // JS-002 is the first candidate, so a hidden-by-the-newest-task bug would show here.
  assert.equal(comparisonRequests(list, catalog).lengths[0].challenge, "JS-002");
  const one = stored("high", "high");
  // JS-002 has no stored runs at all (empty roster); JS-001 has one matching default run.
  for (const missing of [[], "unavailable"] as const) {
    const s = stats({ [key2]: missing as ModelReceipt[] | "unavailable", [key1]: [one] });
    assert.deepEqual(s.requests.receipts.map((p) => p.challenge).sort(), ["JS-001", "JS-002"], "each task is read on its own");
    assert.equal(s.model.state, "shown", `JS-002 ${JSON.stringify(missing)}`);
    if (s.model.state !== "shown") return;
    assert.equal(s.model.fyi.challenge, "JS-001");
    assert.equal(
      s.model.fyi.text,
      "On Synthetic Sum (current version, same runtime and diagnostics), synthetic/model solved it on its first try at its default setting. One observed run, not a success rate.",
    );
    assert.match(s.html, /data-comparison="model"/);
  }
  // Two matching runs: the whole account, k of n.
  const two = stats({ [key2]: [], [key1]: [one, { ...stored("high", "high", "synthetic/other"), state: "stopped", finalCodeLength: null }] });
  assert.match((two.model as any).fyi.text, /1 of 2 models solved it on their first try at their default setting\. One try each, not a success rate\.$/);
});

test("provenance: a medium or high run counts only when that model declared it its default", () => {
  const shown = (r: ModelReceipt) => stats({ [key2]: [], [key1]: [r] }).model.state;
  assert.equal(shown(stored("high", "high")), "shown");
  assert.equal(shown(stored("medium", "medium")), "shown");
  assert.equal(shown(stored("medium", "high")), "omitted", "not this model's default");
  assert.equal(shown(stored("high", null)), "omitted", "missing default metadata is never relabelled");
  assert.equal(shown({ ...stored("high", "high"), try: 2 }), "omitted", "no first try on record");
  // Never borrowed: trial 1 without its own default declaration isn't made "default" by trial 2's.
  const borrowed = stats({ [key2]: [], [key1]: [stored("high", null), { ...stored("high", "high"), try: 2 }] });
  assert.equal(borrowed.model.state, "omitted", "trial 1 lacks its own provenance; trial 2 is not a first try");
});

test("identity: a run is counted only when the model reported answering is the one requested", () => {
  // Requested synthetic/model, but the provider reported another model answering: not attributed.
  const other = stored("high", "high", slot.model, "synthetic/another-model");
  assert.deepEqual(other.reportedModels, ["synthetic/another-model"]);
  assert.equal(stats({ [key2]: [], [key1]: [other] }).model.state, "omitted");
  // The same run answered by the requested model is named as that model.
  assert.match((stats({ [key2]: [], [key1]: [stored("high", "high")] }).model as any).fyi.text, /synthetic\/model solved it/);
});

test("negatives: setup mismatch, unfinished runs, stealth and the off switch say nothing", () => {
  const one = stored("high", "high");
  const mismatch = stats({ [key2]: [], [key1]: [{ ...one, runtime: { ...runtime, version: "other" } }] });
  assert.deepEqual([mismatch.model.state, (mismatch.model as any).reason], ["omitted", "unmatched"]);
  assert.doesNotMatch(mismatch.html, /data-comparison="model"/);
  const diag = stats({ [key2]: [], [key1]: [{ ...one, features: [...one.features, "type-diagnostics"] }] });
  assert.equal(diag.model.state, "omitted", "different diagnostics setting");
  const queued = stats({ [key2]: [], [key1]: [{ ...one, state: "queued", runtime: null }] });
  assert.equal(queued.model.state, "omitted", "an unfinished slot is neither a solve nor a failure");
  const stealth = stats({ [key2]: [], [key1]: [one] }, { ...viewer, stealth: true } as StoredProfile);
  assert.deepEqual([stealth.model.state, (stealth.model as any).reason], ["omitted", "off"]);
  // No comparison, model or human, sets player time against model latency or submissions.
  assert.doesNotMatch(stats({ [key2]: [], [key1]: [one] }).html, /latency|faster|slower|submissions than/i);
});
