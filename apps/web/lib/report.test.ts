import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveAttempts, type AttemptSummary } from "../../../packages/developer-profile/derive";
import { trace, syntheticRevision } from "../../../packages/developer-profile/fixtures";
import type { ModelReceipt } from "../../../packages/model-runs/receipts";
import type { ChallengeSummary } from "./challenges";
import type { Progress } from "./progress";
import { buildReport, duration, mergeEvidence, type Question, type ReportAttempt, type ReportInput } from "./report";

const challenge = (key: string, language: string, difficulty = "easy", revision = syntheticRevision) =>
  ({ key, title: `Synthetic ${key}`, language, tags: ["arrays"], difficulty, runnable: true, revision }) as unknown as ChallengeSummary;
const revB = `sha256:${"b".repeat(64)}`;
const catalog = [
  challenge("JS-001", "javascript", "easy"),
  challenge("JS-002", "javascript", "medium"),
  challenge("PY-001", "python", "medium", revB),
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
    py = summary("a2", "PY-001", revB);
  const r = buildReport(input({ attempts: device(js, py) }));
  // The fixture's few keys never form a run of code characters, so typing is left out.
  assert.deepEqual(r.questions.map((x) => x.id), ["start", "iterate", "recovery", "rewrite", "difficulty", "languages"]);
  // The fixture: first edit at 0.1 s, 2 submissions, the first failed.
  assert.equal(q(r, "start")!.answer, "Your first edit comes about 1 s in.");
  assert.equal(q(r, "iterate")!.answer, "A few checks per solve: 2 checks in a typical one.");
  assert.deepEqual(q(r, "iterate")!.visual, { kind: "bars", bars: [{ label: "2–3 checks", value: 2, display: "2 solves" }] });
  assert.equal(q(r, "recovery")!.answer, "You kept going: 2 solves came after a failed first submission.");
  assert.equal(q(r, "rewrite")!.answer, "Mostly small edits: 100% change 20 characters or fewer.");
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

/** The fixture trace with its key batch replaced: [elapsedMs, key, modifiers] per keydown. */
function withKeys(attempt: string, keys: [number, string, string][], features?: string[]): AttemptSummary {
  const records = trace(attempt, `${attempt}-source`).map((r) => {
    const o = JSON.parse(r.payload);
    if (features && o.type === "practice.opened") return { ...r, payload: JSON.stringify({ ...o, data: { ...o.data, editor: { ...o.data.editor, features } } }) };
    if (o.type !== "practice.keys") return r;
    o.data.keys = keys.map(([at, key, mods]) => [at, "down", key, key.length === 1 ? `Key${key.toUpperCase()}` : key, mods, false]);
    return { ...r, payload: JSON.stringify(o) };
  });
  return deriveAttempts(records, "synthetic-participant")[0];
}

test("typing speed counts only runs of code characters, pooled, never arrows, shortcuts or pauses", () => {
  const typed = Array.from({ length: 61 }, (_, i) => [200 + i * 100, "abcdefghij"[i % 10], ""] as [number, string, string]);
  const a = withKeys("k1", typed);
  assert.equal(a.values.typedKeys, 60);
  assert.equal(a.values.typingTime, 6000);
  // 60 keys in 6 s: 600 a minute, 120 words.
  assert.equal(q(buildReport(input({ attempts: device(a) })), "typing")!.answer, "About 120 words a minute while you're typing code.");
  const arrows = withKeys("k2", Array.from({ length: 61 }, (_, i) => [200 + i * 100, "ArrowRight", ""] as [number, string, string]));
  assert.equal(arrows.values.typedKeys, 0);
  assert.equal(q(buildReport(input({ attempts: device(arrows) })), "typing"), undefined, "an arrow-only burst is not typing");
  const shortcuts = withKeys("k3", Array.from({ length: 61 }, (_, i) => [200 + i * 100, "c", "C"] as [number, string, string]));
  assert.equal(shortcuts.values.typedKeys, 0, "Ctrl+C is not a typed character");
  const paused = withKeys("k4", Array.from({ length: 61 }, (_, i) => [200 + i * 2500, "a", ""] as [number, string, string]));
  assert.equal(paused.values.typedKeys, 0, "keys 2.5 s apart are pauses, not typing");
});

test("the first-edit answer ignores resumes and idle time after a solve", () => {
  const a = summary("p1", "JS-001");
  const idle = { ...a, values: { ...a.values, elapsed: 6 * 3600_000 } };
  assert.equal(q(buildReport(input({ attempts: device(idle) })), "start")!.answer, "Your first edit comes about 1 s in.");
  assert.doesNotMatch(JSON.stringify(q(buildReport(input({ attempts: device(idle) })), "start")), /to a solve|6 h/);
});

test("deleting starter code or pasting changes edit sizes, never a claim about what survived", () => {
  const a = summary("s1", "JS-001");
  const starterAndPaste = { ...a, values: { ...a.values, deleted: 400, inserted: 600, smallEdits: 6, largeEdits: 4, paste: 2 } };
  const r = q(buildReport(input({ attempts: device(starterAndPaste) })), "rewrite")!;
  assert.equal(r.answer, "Often bigger pieces: 40% of your edits change more than 20 characters at once.");
  assert.doesNotMatch(JSON.stringify(r), /stays|kept|surviv|rewrite intent/i);
});

test("repeated solves count each model try once in the FYI", () => {
  const solves = [summary("x1", "JS-001"), summary("x2", "JS-001"), summary("x3", "JS-001"), summary("y1", "PY-001", revB)];
  const receipts = {
    [syntheticRevision]: [receipt({ submissions: 2 })],
    [revB]: [receipt({ submissions: 6, runtime: { engine: "javascript", version: "synthetic" } })],
  };
  // Distinct tries [2, 6] give 4; counting JS-001's try three times would give 2.
  assert.equal(q(buildReport(input({ attempts: device(...solves), receipts })), "iterate")!.fyi, "FYI: models that solved the same challenges needed 4 submissions, typically.");
});

test("an attempt on an earlier revision isn't classified with current difficulty or language", () => {
  const old = summary("h1", "JS-001", `sha256:${"c".repeat(64)}`),
    other = summary("h2", "PY-001", revB);
  const r = buildReport(input({ attempts: device(old, other) }));
  assert.equal(q(r, "difficulty"), undefined, "only PY-001 (medium) has matching metadata: one level");
  assert.equal(q(r, "languages")!.answer, "All Python so far.");
});

test("reproduction: a page observation an hour after completion doesn't change any answer", () => {
  const base = trace("late-page", "late-page-source");
  const last = JSON.parse(base.at(-1)!.payload);
  const page = {
    ...last,
    type: "practice.page",
    observationId: "late-page-observation",
    source: { ...last.source, sequence: last.source.sequence + 1 },
    elapsedMs: last.elapsedMs + 3600_000,
    occurredAt: new Date(Date.parse(last.occurredAt) + 3600_000).toISOString(),
    data: { visible: true, focused: true, width: 1280, height: 800 },
  };
  const later = [...base, { ...base.at(-1)!, recordId: page.observationId, payload: JSON.stringify(page) }];
  const before = buildReport(input({ attempts: device(deriveAttempts(base, "synthetic-participant")[0]) }));
  const after = buildReport(input({ attempts: device(deriveAttempts(later, "synthetic-participant")[0]) }));
  assert.ok(deriveAttempts(later, "synthetic-participant")[0].values.elapsed! >= 3600_000, "the session span grew by an hour");
  assert.deepEqual(after.questions.map((x) => x.answer), before.questions.map((x) => x.answer));
  assert.doesNotMatch(after.questions.map((x) => x.answer).join(" "), /\bh\b|to a solve/);
});

test("reproduction: 10 inserted and 100 deleted units make no survival claim", () => {
  const a = summary("i10d100", "JS-001");
  const r = q(buildReport(input({ attempts: device({ ...a, values: { ...a.values, inserted: 10, deleted: 100 } }) })), "rewrite")!;
  assert.doesNotMatch(JSON.stringify(r), /stays|%\s*of what you type/);
});

test("Vim keybindings make the typing rate unavailable: normal-mode letters are commands", () => {
  const hjkl = Array.from({ length: 61 }, (_, i) => [200 + i * 100, "hjkl"[i % 4], ""] as [number, string, string]);
  const vim = withKeys("v1", hjkl, ["syntax-highlighting", "vim-keybindings"]);
  assert.equal(vim.values.typedKeys, null);
  assert.equal(vim.values.typingTime, null);
  assert.equal(q(buildReport(input({ attempts: device(vim) })), "typing"), undefined);
  assert.equal(withKeys("v2", hjkl).values.typedKeys, 60, "the same letters count in the standard keymap");
});

test("editing after a solve doesn't change time by difficulty; the solve stays the cutoff", () => {
  const base = trace("post-solve", "post-solve-source");
  const last = JSON.parse(base.at(-1)!.payload);
  // Five minutes of edits 20 s apart after completion: all inside the 30 s active gap.
  const extra = Array.from({ length: 15 }, (_, i) => {
    const o = {
      ...last,
      type: "practice.edit",
      observationId: `post-solve-edit-${i}`,
      source: { ...last.source, sequence: last.source.sequence + 1 + i },
      elapsedMs: last.elapsedMs + 20_000 * (i + 1),
      occurredAt: new Date(Date.parse(last.occurredAt) + 20_000 * (i + 1)).toISOString(),
      data: { file: "synthetic.js", revision: 10 + i, changes: [7, [0, "z"]], changesBytes: 10, changesTruncated: false, userEvent: "input.type", selection: null, docLength: 8 + i },
    };
    return { ...base.at(-1)!, recordId: o.observationId, payload: JSON.stringify(o) };
  });
  const before = deriveAttempts(base, "synthetic-participant")[0],
    after = deriveAttempts([...base, ...extra], "synthetic-participant")[0];
  assert.ok(after.values.active! > before.values.active! + 200_000, "whole-attempt active time grew");
  assert.equal(after.values.activeToSolve, before.values.activeToSolve, "time to the solve didn't");
  const py = summary("post-solve-py", "PY-001", revB);
  const answer = (a: AttemptSummary) => q(buildReport(input({ attempts: device(a, py) })), "difficulty")!.answer;
  assert.equal(answer(after), answer(before));
});

test("recovery states solves after a failed first submission, never checks to a solve", () => {
  const a = summary("rc1", "JS-001");
  // recoveryChecks counts checks to the first improvement (0/3 to 1/3), not to 3/3.
  const r = q(buildReport(input({ attempts: device({ ...a, values: { ...a.values, recoveryChecks: 1 } }) })), "recovery")!;
  assert.equal(r.answer, "You kept going: 1 solve came after a failed first submission.");
  assert.doesNotMatch(r.answer, /check/);
});
