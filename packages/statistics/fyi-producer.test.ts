/**
 * Both comparison adapters fed by the real producers (synthetic trace → deriveAttempts →
 * localHistory), not hand-built clean summaries: normal first solves arrive as practice "unknown",
 * explicit or later repeats as "repeat", and damaged captures carry issues.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { trace, syntheticRevision } from "../developer-profile/fixtures";
import { deriveAttempts } from "../developer-profile/derive";
import { localHistory } from "../developer-profile/history";
import type { StoredRecord } from "../domain/records";
import { cohortResult } from "./cohort";
import { humanFyi, humanFyiCandidates } from "./human-fyi";
import { modelFyi, modelFyiCandidates } from "../model-runs/stats-fyi";
import type { ModelReceipt } from "../model-runs/receipts";

const participant = "synthetic-participant";
const catalog = [{ key: "JS-001", revision: syntheticRevision, title: "Synthetic Sum" }];
const adult = { age: "25-34", stealth: false };
const history = (records: StoredRecord[]) =>
  localHistory({ settings: { participantId: participant }, records, outbox: [] });
// The trace's own recorded setup, so cohort and model rows match it the way real data would.
const runtime = { engine: "javascript", version: "synthetic" };
const editor = { name: "CodeMirror", features: ["syntax-highlighting"] };
const cohort = cohortResult(
  [
    [1, 9],
    [0, 11],
  ].map(([first_pass, browsers]) => ({
    runtime: JSON.stringify(runtime),
    editor: JSON.stringify(editor),
    diagnostics: 0,
    practice: "first",
    completed: 1,
    first_pass,
    submissions: 2,
    browsers,
  })),
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
  features: ["edit-code-tool"],
  budget: { turns: 50, submissions: 10 },
  ...over,
});
const humanReads = [{ challenge: "JS-001", revision: syntheticRevision, read: cohort }];
const modelReads = [{ challenge: "JS-001", revision: syntheticRevision, receipts: [receipt("m/a")] }];

test("a normal first solve (practice unknown) reaches both adapters", () => {
  const [solve] = deriveAttempts(trace(), participant);
  assert.equal(solve.practice, "unknown");
  assert.deepEqual(solve.issues, []);
  assert.equal(humanFyiCandidates([solve], catalog).length, 1);
  const human = humanFyi([solve], catalog, adult, humanReads, true);
  assert.equal(human.state, "shown");
  assert.match((human as any).fyi.text, /^Among first attempts at Synthetic Sum /);
  // Descriptive context only: nothing claims the player's own attempt was a first one.
  assert.doesNotMatch((human as any).fyi.text, /\byour\b/i);
  assert.equal(modelFyiCandidates([solve], catalog).length, 1);
  const model = modelFyi([solve], catalog, { stealth: false }, modelReads, { [solve.attempt]: 120 });
  assert.equal(model.state, "shown");
  assert.equal((model as any).fyi.kind, "code-length");
});

test("a repeat from localHistory still gets the cohort's first-attempt context, never a repeat claim", () => {
  const attempts = history([...trace("a1", "s1"), ...trace("a2", "s2")]);
  assert.deepEqual(attempts.map((a) => a.practice), ["unknown", "repeat"]);
  const human = humanFyi(attempts, catalog, adult, humanReads, true);
  assert.equal(human.state, "shown");
  assert.equal((human as any).fyi.practice, "first");
});

test("damaged captures never become candidates, whatever runtime and editor strings they carry", () => {
  const clean = trace();
  const damaged: [string, StoredRecord[]][] = [
    ["start missing", clean.filter((r) => !JSON.parse(r.payload).type?.includes("practice.started"))],
    [
      "unsupported capture version",
      clean.map((r) => ({ ...r, payload: JSON.stringify({ ...JSON.parse(r.payload), captureVersion: "practice-capture-0.9.0" }) })),
    ],
    [
      "conflicting record",
      [...clean, { ...clean[3], payload: JSON.stringify({ ...JSON.parse(clean[3].payload), elapsedMs: 1 }) }],
    ],
  ];
  for (const [why, records] of damaged) {
    const attempts = deriveAttempts(records, participant);
    assert.ok(attempts.every((a) => a.issues.length > 0), `${why}: producer flags it`);
    assert.ok(
      attempts.some((a) => a.conditions.some((c) => c.startsWith("Runtime: "))) || why === "unsupported capture version",
      `${why}: conditions alone would have looked usable`,
    );
    assert.deepEqual(humanFyiCandidates(attempts, catalog), [], why);
    assert.deepEqual(modelFyiCandidates(attempts, catalog), [], why);
    assert.equal(humanFyi(attempts, catalog, adult, humanReads, true).state, "omitted", why);
    assert.equal(modelFyi(attempts, catalog, { stealth: false }, modelReads).state, "omitted", why);
  }
});
