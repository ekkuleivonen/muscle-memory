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

test("several matched runs: the player's code beside the solving runs' median, with the whole account", () => {
  const r = run([...three, receipt("m/d", { state: "error", finalCodeLength: null })]);
  if (r.state !== "shown" || r.fyi.kind !== "code-length") return assert.fail("code length expected");
  assert.deepEqual([r.fyi.yours, r.fyi.modelLength, r.fyi.lengthRuns, r.fyi.solved, r.fyi.ran], [140, 120, 3, 3, 4]);
  assert.equal(
    r.fyi.text,
    "On Synthetic Sum (current version, same runtime and diagnostics), your passing code was 140 characters; 3 of 4 models solved it on their first try at their default setting, with a median of 120 across those 3 solving runs. Length isn't a score.",
  );
  assert.doesNotMatch(r.fyi.text, /shorter|longer|better|worse|%/);
  assert.deepEqual(r.fyi.runs.map((x) => [x.model, x.outcome]), [["m/a", "solved"], ["m/b", "solved"], ["m/c", "solved"], ["m/d", "error"]]);
});

test("one matched run is that named model's observed result, with no threshold or population claim", () => {
  const solo = run([receipt("m/a", { finalCodeLength: 95 })]);
  assert.equal(
    (solo as any).fyi.text,
    "On Synthetic Sum (current version, same runtime and diagnostics), your passing code was 140 characters; m/a solved it on its first try at its default setting with 95. One observed run; length isn't a score.",
  );
  for (const [state, said] of [
    ["stopped", "stopped without solving it"],
    ["budget", "ran out of its budget without solving it"],
    ["refused", "refused it"],
    ["error", "ended with an error without solving it"],
  ] as const) {
    const r = run([receipt("m/a", { state, finalCodeLength: null })]);
    if (r.state !== "shown" || r.fyi.kind !== "outcome") return assert.fail(state);
    assert.equal(
      r.fyi.text,
      `On Synthetic Sum (current version, same runtime and diagnostics), m/a ${said} on its first try at its default setting. One observed run, not a success rate.`,
    );
  }
  // Without the player's own local length, a solve is still an observed outcome, not a length.
  assert.match((run([receipt("m/a")], {}) as any).fyi.text, /m\/a solved it on its first try at its default setting\. One observed run/);
});

test("without the player's local code length, the outcome account is said, failures included", () => {
  const rows = [...three, receipt("m/d", { state: "error", finalCodeLength: null }), receipt("m/e", { state: "budget", finalCodeLength: null })];
  const r = run(rows, {});
  if (r.state !== "shown" || r.fyi.kind !== "outcome") return assert.fail("outcome expected");
  assert.deepEqual([r.fyi.solved, r.fyi.ran, r.fyi.yours, r.fyi.modelLength], [3, 5, null, null]);
  assert.equal(
    r.fyi.text,
    "On Synthetic Sum (current version, same runtime and diagnostics), 3 of 5 models solved it on their first try at their default setting. One try each, not a success rate.",
  );
  // No solving run with recorded code: the outcome, never a length from nothing.
  const failedOnly = run([receipt("m/a", { state: "stopped", finalCodeLength: null }), receipt("m/b", { state: "refused", finalCodeLength: null })]);
  assert.equal((failedOnly as any).fyi.kind, "outcome");
  assert.match((failedOnly as any).fyi.text, /0 of 2 models solved it/);
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
  if (r.state !== "shown") return assert.fail("shown expected");
  assert.deepEqual([r.fyi.solved, r.fyi.ran], [2, 3]);
  // Conflicting duplicates of a model's first try drop that model, not choose between them.
  const conflicting = run([...three, receipt("m/a", { finalCodeLength: 91 })], {});
  assert.deepEqual([(conflicting as any).fyi.solved, (conflicting as any).fyi.ran], [2, 2]);
});

test("runtime, diagnostics, reported-model and unfinished mismatches are withheld, never counted as failures", () => {
  const off = (over: Partial<ModelReceipt>) => three.map((r) => ({ ...r, ...over }));
  assert.deepEqual(run(off({ runtime: { ...runtime, version: "other" } })), { state: "omitted", reason: "unmatched" });
  assert.deepEqual(run(off({ features: ["edit-code-tool"] })), { state: "omitted", reason: "unmatched" });
  assert.deepEqual(run(off({ reportedModels: [] })), { state: "omitted", reason: "unmatched" });
  for (const state of ["queued", "running", "missing", "incompatible", "infrastructure-failed", "receipt-unavailable"] as const)
    assert.deepEqual(run(off({ state, finalCodeLength: null })), { state: "omitted", reason: "unmatched" }, state);
  // An unfinished run beside finished ones is left out of the account, not counted as a failure.
  const mixed = run([...three, receipt("m/d", { state: "missing", runtime: null, finalCodeLength: null })], {});
  assert.deepEqual([(mixed as any).fyi.solved, (mixed as any).fyi.ran], [3, 3]);
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
