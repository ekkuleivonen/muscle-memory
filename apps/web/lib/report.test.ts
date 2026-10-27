import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveAttempts, type AttemptSummary } from "../../../packages/developer-profile/derive";
import { trace } from "../../../packages/developer-profile/fixtures";
import type { ModelReceipt } from "../../../packages/model-runs/receipts";
import type { ChallengeSummary } from "./challenges";
import type { Progress } from "./progress";
import { buildReport, duration, mergeEvidence, type Question, type ReportAttempt, type ReportInput } from "./report";

const challenge = (key: string, language: string, difficulty = "easy") =>
  ({ key, title: `Synthetic ${key}`, language, tags: ["arrays"], difficulty, runnable: true }) as unknown as ChallengeSummary;
const catalog = [
  challenge("JS-001", "javascript", "easy"),
  challenge("JS-002", "javascript", "medium"),
  challenge("PY-001", "python", "medium"),
  challenge("PY-002", "python", "hard"),
];
const progressOf = (p: Record<string, { completedAt: string | null; completions: number; attempt?: string }>): Progress =>
  Object.fromEntries(
    Object.entries(p).map(([k, v]) => [k, { attempt: v.attempt ?? `${k}-attempt`, startedAt: "2026-10-27T10:00:00Z", ...v }]),
  );
const summary = (attempt: string, key: string, revision?: string): AttemptSummary =>
  deriveAttempts(trace(attempt, `${attempt}-source`, key, revision), "synthetic-participant")[0];
const device = (...a: AttemptSummary[]): ReportAttempt[] => a.map((x) => ({ ...x, source: "device" as const }));
const input = (over: Partial<ReportInput> = {}): ReportInput => ({ catalog, progress: {}, attempts: [], profile: null, receipts: {}, ...over });
const q = (r: ReturnType<typeof buildReport>, id: Question["id"]) => r.questions.find((x) => x.id === id);
// Carries ENG-375's receipt fields; the assertion keeps it valid across that type change.
const receipt = (over: Partial<ModelReceipt> = {}): ModelReceipt =>
  ({
    model: "synthetic/model",
    reportedModels: ["synthetic/model-2026"],
    reasoning: "high",
    harness: "harness-1",
    try: 1,
    state: "completed",
    submissions: 2,
    runtime: { engine: "javascript", version: "synthetic" },
    features: [],
    budget: { turns: 50, submissions: 10 },
    defaultReasoning: "high",
    finalCodeLength: null,
    ...over,
  }) as ModelReceipt;
/** Everything a player reads: questions, answers, notes, FYIs, the waiting line and links. */
const visible = (r: ReturnType<typeof buildReport>) =>
  [r.waiting, r.next?.label, r.profile?.label, ...r.questions.flatMap((x) => [x.question, x.answer, x.note, x.fyi])].join(" ");

test("a new player gets one line and a start, no empty cards", () => {
  const r = buildReport(input());
  assert.equal(r.empty, true);
  assert.deepEqual(r.questions, []);
  assert.equal(r.next?.href, "/start");
  assert.equal(r.profile, null);
});

test("something started but nothing answerable stays brief: one line and the resume", () => {
  const r = buildReport(input({ progress: progressOf({ "JS-001": { completedAt: null, completions: 0 } }) }));
  assert.equal(r.empty, false);
  assert.deepEqual(r.questions, []);
  assert.equal(r.waiting, "Solve a challenge and your answers start here.");
  assert.equal(r.next?.href, "/challenges/JS-001");
});

test("a solved trace answers the supported questions from recorded values only", () => {
  const js = summary("a1", "JS-001"),
    py = summary("a2", "PY-001", `sha256:${"b".repeat(64)}`);
  const r = buildReport(input({ attempts: device(js, py) }));
  assert.deepEqual(r.questions.map((x) => x.id), ["start", "iterate", "recovery", "rewrite", "typing", "difficulty", "languages"]);
  // The fixture: first edit at 0.1 s, a 9.3 s session, 2 submissions, the first failed.
  assert.equal(q(r, "start")!.answer, "About 1 s before your first edit, then 9 s to a solve.");
  assert.equal(q(r, "iterate")!.answer, "A few checks per solve: 2 checks in a typical one.");
  assert.deepEqual(q(r, "iterate")!.visual, { kind: "bars", bars: [{ label: "2–3 checks", value: 2, display: "2 solves" }] });
  assert.equal(q(r, "recovery")!.answer, "2 solves came after a failed first submission, a median of 1 more check later.");
  // 5 characters inserted, 2 deleted: 60% stays; all edits small.
  assert.equal(q(r, "rewrite")!.answer, "You patch in small edits; about 60% of what you type stays.");
  // 90 ms between keystrokes in a burst: 60000 / 90 / 5 = 133.
  assert.equal(q(r, "typing")!.answer, "About 133 words a minute while you're typing.");
  assert.equal(q(r, "difficulty")!.answer, "easy 7 s, medium 7 s of active time, typically.");
  assert.equal(q(r, "languages")!.answer, "Mostly JavaScript, then Python.");
  assert.doesNotMatch(visible(r), /thinking|reading|finished \d|open|revisited|waiting|sha256|revision|harness|receipt|evidence/i);
});

test("gapped traces, one difficulty level and no failed first submission leave questions out", () => {
  const a = summary("g1", "JS-001");
  const gapped = { ...a, issues: ["Recording gap."] };
  assert.deepEqual(buildReport(input({ attempts: device(gapped) })).questions, []);
  const r = buildReport(input({ attempts: device(a) }));
  assert.equal(q(r, "difficulty"), undefined, "one level isn't an answer to by-difficulty");
  const clean = { ...a, values: { ...a.values, firstSubmit: 1 } };
  assert.equal(q(buildReport(input({ attempts: device(clean) })), "recovery"), undefined);
});

test("the model comparison is one tiny FYI on the iterate answer, only from comparable solves", () => {
  const a = summary("m1", "JS-001");
  const fyi = (receipts: ReportInput["receipts"]) => q(buildReport(input({ attempts: device(a), receipts })), "iterate")!.fyi;
  assert.equal(fyi({ [a.revision]: [receipt()] }), "FYI: models that solved the same challenges needed 2 submissions, typically.");
  assert.equal(fyi({}), null);
  assert.equal(fyi({ [a.revision]: "loading" }), null);
  assert.equal(fyi({ [a.revision]: "unavailable" }), null);
  assert.equal(fyi({ [a.revision]: [receipt({ runtime: { engine: "python" } })] }), null, "a different runtime isn't comparable");
  assert.equal(fyi({ [a.revision]: [receipt({ state: "stopped" })] }), null);
  assert.equal(fyi({ [a.revision]: [receipt({ reasoning: "low", defaultReasoning: "high" })] }), null, "only the default setting counts");
  const r = buildReport(input({ attempts: device(a), receipts: { [a.revision]: [receipt()] } }));
  assert.equal(r.questions.filter((x) => x.fyi).length, 1, "never a comparison section");
});

test("a later solve with fewer submissions answers the repeat question; otherwise it's left out", () => {
  const first = summary("r1", "JS-001"),
    later = { ...summary("r2", "JS-001"), started: "2026-10-28T10:00:00Z", values: { ...first.values, submissions: 1, firstSubmit: 1 } };
  assert.equal(q(buildReport(input({ attempts: device(first, later) })), "repeat")!.answer, "Back on JS-001, you needed 1 submission instead of 2.");
  const other = { ...later, conditions: ["Runtime: {}"] };
  assert.equal(q(buildReport(input({ attempts: device(first, other) })), "repeat"), undefined);
});

test("durations read in seconds, minutes or hours without false precision", () => {
  assert.equal(duration(400), "1 s");
  assert.equal(duration(42_000), "42 s");
  assert.equal(duration(5 * 60_000 + 20_000), "5 min");
  assert.equal(duration(95 * 60_000), "1 h 35 min");
});

test("device and uploaded evidence is deduplicated by attempt and revision", () => {
  const a = summary("d1", "JS-001");
  const older = { ...a, last: "2026-10-27T09:00:00Z" };
  const merged = mergeEvidence([a], [older, summary("d2", "PY-001")]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((x) => x.attempt === "d1")!.source, "device");
  assert.equal(mergeEvidence([a], [{ ...a, last: "2026-10-28T00:00:00Z" }])[0].source, "uploaded");
  assert.equal(mergeEvidence([a], [{ ...a, revision: `sha256:${"c".repeat(64)}` }]).length, 2, "revisions stay separate");
});

test("the real uploaded-history projection flows into the portrait beside device evidence", async () => {
  const { historyResult, historyWindow } = await import("../../../packages/developer-profile/uploaded-history");
  const older = trace("older-attempt", "older-source", "JS-001"),
    latest = trace("latest-attempt", "latest-source", "JS-001");
  // Rows shaped like the fixed owner query's result: one attempt row each, then its observations.
  const rows = [older, latest].flatMap((records) => {
    const o = JSON.parse(records[0].payload),
      times = records.map((r) => JSON.parse(r.payload).occurredAt).sort();
    return [
      {
        scope: "attempt",
        attempt_id: o.attemptId,
        observations: records.length,
        bytes: records.reduce((n, r) => n + r.payload.length, 0),
        first_at: times[0],
        last_at: times.at(-1),
        conflicts: 0,
        record_id: null,
        payload: null,
      },
      ...records.map((r) => ({ scope: "observation", attempt_id: o.attemptId, record_id: r.recordId, payload: r.payload })),
    ];
  });
  const page = historyResult("synthetic-participant", historyWindow({ from: "2026-10-27", to: "2026-10-27", after: "" }), rows);
  const merged = mergeEvidence(deriveAttempts(latest, "synthetic-participant"), page.attempts);
  assert.deepEqual(merged.map((a) => [a.attempt, a.source]), [
    ["latest-attempt", "device"],
    ["older-attempt", "uploaded"],
  ]);
  const r = buildReport(input({ attempts: merged }));
  assert.match(q(r, "iterate")!.answer, /2 checks/);
  assert.doesNotMatch(JSON.stringify(r), /synthetic-artifact|"abc"|secret/, "no code or identifiers reach the report");
});
