import { test } from "node:test";
import assert from "node:assert/strict";
import type { AttemptSummary } from "../developer-profile/derive";
import { cohortResult, type CohortRead } from "./cohort";
import { humanFyi, humanFyiCandidates, type HumanCohortRead } from "./human-fyi";

const revision = `sha256:${"a".repeat(64)}`;
const runtime = { id: "javascript", version: "synthetic" };
const editor = { name: "CodeMirror", features: ["syntax-highlighting", "type-diagnostics"] };
const catalog = [{ key: "JS-001", revision, title: "Synthetic Sum" }];
const adult = { age: "25-34", stealth: false };

function attempt(over: Partial<AttemptSummary> = {}): AttemptSummary {
  return {
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
      `Editor: ${editor.name}; features: ${editor.features.join(", ")}`,
      `Runtime: ${JSON.stringify(runtime)}`,
    ],
    ...over,
  } as AttemptSummary;
}
/** Synthetic aggregated rows: `passed` browsers passed their scored first submission, `failed` didn't. */
function group(passed: number, failed: number, unscored = 0, practice = "first"): CohortRead {
  const row = (first_pass: number | null, browsers: number) => ({
    runtime: JSON.stringify(runtime),
    editor: JSON.stringify(editor),
    diagnostics: 1,
    practice,
    completed: 1,
    first_pass,
    submissions: first_pass === null ? 0 : 2,
    browsers,
  });
  return cohortResult(
    [row(1, passed), row(0, failed), row(null, unscored)].filter((r) => r.browsers),
  );
}
const bound = (read: HumanCohortRead["read"], over: Partial<HumanCohortRead> = {}) => [
  { challenge: "JS-001", revision, read, ...over },
];
const run = (
  read: HumanCohortRead["read"],
  options: { a?: AttemptSummary; viewer?: any; over?: Partial<HumanCohortRead> } = {},
) => humanFyi([options.a ?? attempt()], catalog, "viewer" in options ? options.viewer : adult, bound(read, options.over), true);

test("20 eligible matched browsers show one named, bounded FYI", () => {
  const r = run(group(9, 11));
  assert.equal(r.state, "shown");
  if (r.state !== "shown") return;
  assert.equal(r.fyi.challenge, "JS-001");
  assert.equal(r.fyi.attempt, "a1");
  assert.equal(r.fyi.share, 0.45);
  assert.equal(r.fyi.browsers, "20–49");
  assert.equal(
    r.fyi.text,
    "On Synthetic Sum (current version, same runtime and editor setup), about 45% of scored first submissions passed, across first attempts from 20–49 browsers.",
  );
  // Aggregate only: no browser IDs, counts or raw rows.
  assert.doesNotMatch(JSON.stringify(r), /viewer|participant|"browsers":\d/);
});

test("the metric uses its own denominator, not everyone who started", () => {
  // 25 started, 20 had a scored first submission: the band is that of the 20.
  const r = run(group(10, 10, 5));
  assert.equal(r.state === "shown" && r.fyi.browsers, "20–49");
  // 20 started but only 19 scored: the share is withheld, so nothing is said.
  assert.deepEqual(run(group(9, 10, 1)), { state: "omitted", reason: "too-few" });
});

test("19 browsers, a repeat group, or any setup mismatch is too few, never a near match", () => {
  assert.deepEqual(run(group(9, 10)), { state: "omitted", reason: "too-few" });
  assert.deepEqual(run(group(9, 11, 0, "repeat")), { state: "omitted", reason: "too-few" });
  const other = (cond: string[]) => run(group(9, 11), { a: attempt({ conditions: cond }) });
  const [e, rt] = attempt().conditions;
  for (const cond of [
    [e, `Runtime: ${JSON.stringify({ ...runtime, version: "other" })}`],
    [`Editor: CodeMirror; features: syntax-highlighting`, rt],
  ])
    assert.deepEqual(other(cond), { state: "omitted", reason: "too-few" });
});

test("unknown, under-18, stealth and signed-out viewers get no adult comparison", () => {
  assert.deepEqual(run(group(9, 11), { viewer: { stealth: false } }), { state: "omitted", reason: "age-missing" });
  assert.deepEqual(run(group(9, 11), { viewer: { age: "16-17" } }), { state: "omitted", reason: "not-adult" });
  assert.deepEqual(run(group(9, 11), { viewer: { ...adult, stealth: true } }), { state: "omitted", reason: "off" });
  assert.deepEqual(run(group(9, 11), { viewer: { ...adult, signedOut: true } }), { state: "omitted", reason: "off" });
  assert.deepEqual(run(group(9, 11), { viewer: null }), { state: "omitted", reason: "off" });
});

test("missing, invalidated, disabled and loading reads say nothing and invent nothing", () => {
  const unavailable = { state: "omitted", reason: "unavailable" };
  // The serving path returns "unavailable" for a missing, expired or invalidated snapshot.
  assert.deepEqual(run("unavailable"), unavailable);
  assert.deepEqual(run({ ...group(9, 11), state: "unavailable", groups: [] }), unavailable);
  assert.deepEqual(run({ ...group(9, 11), state: "disabled" }), unavailable);
  assert.deepEqual(run({ ...group(9, 11), state: "earlier-version" }), unavailable);
  assert.deepEqual(run({ ...group(9, 11), minimum: 5 }), unavailable);
  assert.deepEqual(run("loading"), { state: "omitted", reason: "loading" });
  assert.deepEqual(humanFyi([attempt()], catalog, adult, undefined, true), { state: "omitted", reason: "off" });
  assert.deepEqual(humanFyi([attempt()], catalog, adult, bound(group(9, 11))), { state: "omitted", reason: "off" }, "build switch off");
});

test("a read must be bound to the attempt's own challenge and current revision", () => {
  const other = `sha256:${"b".repeat(64)}`;
  assert.deepEqual(run(group(9, 11), { over: { revision: other } }), { state: "omitted", reason: "unavailable" });
  assert.deepEqual(run(group(9, 11), { over: { challenge: "JS-002" } }), { state: "omitted", reason: "unavailable" });
  // Two answers for the same revision: neither is trusted.
  const twice = [...bound(group(9, 11)), ...bound(group(19, 1))];
  assert.deepEqual(humanFyi([attempt()], catalog, adult, twice, true), { state: "omitted", reason: "unavailable" });
  // An attempt on an older revision is not a candidate at all.
  assert.deepEqual(run(group(9, 11), { a: attempt({ revision: other }) }), { state: "omitted", reason: "no-attempt" });
});

test("candidates are solved first attempts with one known setup, newest first, at most three", () => {
  const many = ["a", "b", "c", "d"].map((id, i) =>
    attempt({ attempt: id, last: `2026-10-27T00:0${i}:00Z` }),
  );
  assert.deepEqual(
    humanFyiCandidates(many, catalog).length,
    3,
  );
  assert.deepEqual(humanFyiCandidates([attempt({ practice: "repeat" })], catalog), []);
  assert.deepEqual(humanFyiCandidates([attempt({ completed: false })], catalog), []);
  assert.deepEqual(humanFyiCandidates([attempt({ conditions: [] })], catalog), []);
  assert.deepEqual(
    humanFyiCandidates([attempt({ conditions: ["Editor: CodeMirror; features: ai-completion", attempt().conditions[1]] })], catalog),
    [],
  );
  assert.deepEqual(humanFyi([], catalog, adult, [], true), { state: "omitted", reason: "no-attempt" });
});
