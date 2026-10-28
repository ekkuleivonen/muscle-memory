import { test } from "node:test";
import assert from "node:assert/strict";
import type { AttemptSummary } from "../developer-profile/derive";
import type { ModelReceipt } from "./receipts";
import { modelFyi, modelFyiCandidates, type ModelReceiptsRead } from "./stats-fyi";

const revision = `sha256:${"a".repeat(64)}`;
const runtime = { id: "javascript", version: "synthetic" };
const catalog = [{ key: "JS-001", revision, title: "Synthetic Sum" }];
const viewer = { stealth: false };
const attempt = (over: Partial<AttemptSummary> = {}) =>
  ({
    version: "synthetic",
    participant: "viewer",
    attempt: "a1",
    challenge: "JS-001",
    revision,
    started: "2026-10-27T00:00:00Z",
    last: "2026-10-27T00:10:00Z",
    completed: true,
    practice: "first",
    issues: [],
    values: {},
    answers: {},
    timeline: [],
    conditions: [
      "Editor: CodeMirror; features: syntax-highlighting, type-diagnostics",
      `Runtime: ${JSON.stringify(runtime)}`,
    ],
    ...over,
  }) as AttemptSummary;
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
const three = [
  receipt("m/a", { finalCodeLength: 90 }),
  receipt("m/b", { finalCodeLength: 120 }),
  receipt("m/c", { finalCodeLength: 300 }),
];
const bound = (receipts: ModelReceiptsRead["receipts"], over: Partial<ModelReceiptsRead> = {}) => [
  { challenge: "JS-001", revision, receipts, ...over },
];
const run = (
  receipts: ModelReceiptsRead["receipts"],
  lengths: Record<string, number> = { a1: 140 },
  a = attempt(),
) => modelFyi([a], catalog, viewer, bound(receipts), lengths);

test("code length: the player's passing code beside the median of matched solving models", () => {
  const r = run(three);
  assert.equal(r.state, "shown");
  if (r.state !== "shown" || r.fyi.kind !== "code-length") return assert.fail("code length expected");
  assert.equal(r.fyi.yours, 140);
  assert.equal(r.fyi.modelMedian, 120);
  assert.equal(r.fyi.models, 3);
  assert.equal(
    r.fyi.text,
    "On Synthetic Sum (current version, same runtime and diagnostics), your passing code was 140 characters; the 3 models that solved it at their default setting wrote a median of 120. Counts include whitespace; length isn't a score.",
  );
  assert.doesNotMatch(r.fyi.text, /shorter|longer|better|worse|%/);
});

test("without the player's local code length, the matched outcome is said instead, failures included", () => {
  const rows = [...three, receipt("m/d", { state: "error", finalCodeLength: null }), receipt("m/e", { state: "budget", finalCodeLength: null })];
  const r = run(rows, {});
  if (r.state !== "shown" || r.fyi.kind !== "outcome") return assert.fail("outcome expected");
  assert.equal(r.fyi.solved, 3);
  assert.equal(r.fyi.ran, 5);
  assert.equal(
    r.fyi.text,
    "On Synthetic Sum (current version, same runtime and diagnostics), 3 of 5 models solved it on their first try at their default setting. One try each, not a success rate.",
  );
});

test("each model counts once: first default try, including its failure, never a later success", () => {
  const rows = [
    receipt("m/a", { state: "stopped", finalCodeLength: null }),
    receipt("m/a", { try: 2 }),
    receipt("m/b", { reasoning: "high", defaultReasoning: "default" }),
    receipt("m/b"),
    receipt("m/c"),
  ];
  const r = run(rows, {});
  if (r.state !== "shown" || r.fyi.kind !== "outcome") return assert.fail("outcome expected");
  assert.deepEqual([r.fyi.solved, r.fyi.ran], [2, 3]);
  // Two solving models and a stopped one: not three code lengths, so no length comparison.
  assert.equal(run(rows).state === "shown" && (run(rows) as any).fyi.kind, "outcome");
  // Conflicting duplicates of a model's first try are dropped, not chosen between.
  const conflicting = [...three, receipt("m/a", { finalCodeLength: 91 })];
  assert.deepEqual(run(conflicting, {}), { state: "omitted", reason: "too-few" });
});

test("runtime, diagnostics, reported-model and unfinished mismatches are withheld, never counted as failures", () => {
  const off = (over: Partial<ModelReceipt>) => three.map((r) => ({ ...r, ...over }));
  assert.deepEqual(run(off({ runtime: { ...runtime, version: "other" } })), { state: "omitted", reason: "unmatched" });
  assert.deepEqual(run(off({ features: ["edit-code-tool"] })), { state: "omitted", reason: "unmatched" });
  assert.deepEqual(run(off({ reportedModels: [] })), { state: "omitted", reason: "unmatched" });
  // Queued, running and missing runs carry no runtime: never a matched run, never a failure.
  assert.deepEqual(run(off({ state: "missing", runtime: null, finalCodeLength: null })), { state: "omitted", reason: "unmatched" });
  assert.deepEqual(run(three.slice(0, 2)), { state: "omitted", reason: "too-few" });
  // An AI-completion editor is not a like-for-like setup at all.
  const ai = attempt({ conditions: ["Editor: CodeMirror; features: ai-completion", attempt().conditions[1]] });
  assert.deepEqual(run(three, {}, ai), { state: "omitted", reason: "no-attempt" });
});

test("reads must be bound to the attempt's revision; missing or loading reads invent nothing", () => {
  const other = `sha256:${"b".repeat(64)}`;
  assert.deepEqual(modelFyi([attempt()], catalog, viewer, bound(three, { revision: other })), { state: "omitted", reason: "unavailable" });
  assert.deepEqual(run("unavailable"), { state: "omitted", reason: "unavailable" });
  assert.deepEqual(run("loading"), { state: "omitted", reason: "loading" });
  assert.deepEqual(run([]), { state: "omitted", reason: "unmatched" });
  assert.deepEqual(modelFyi([attempt()], catalog, viewer, undefined), { state: "omitted", reason: "off" });
  assert.deepEqual(modelFyi([attempt()], catalog, { stealth: true }, bound(three)), { state: "omitted", reason: "off" });
  assert.deepEqual(modelFyi([attempt({ revision: other })], catalog, viewer, bound(three)), { state: "omitted", reason: "no-attempt" });
  // A zero or invalid local length is unknown: the outcome is said instead.
  for (const bad of [0, -1, 1.5, NaN])
    assert.equal((run(three, { a1: bad }) as any).fyi.kind, "outcome");
});

test("candidates are bounded and include repeats, which models' first tries don't depend on", () => {
  const many = ["a", "b", "c", "d"].map((id, i) => attempt({ attempt: id, last: `2026-10-27T00:0${i}:00Z` }));
  assert.deepEqual(modelFyiCandidates(many, catalog).map((c) => c.attempt), ["d", "c", "b"]);
  assert.equal(modelFyiCandidates([attempt({ practice: "repeat" })], catalog).length, 1);
  assert.equal(modelFyiCandidates([attempt({ practice: "unknown" })], catalog).length, 0);
});
