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
const q = (r: ReturnType<typeof buildReport>, id: Question["id"] | "rewrite") => r.questions.find((x) => x.id === id);
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
  // Different languages and levels: nothing comparable for "getting faster".
  assert.deepEqual(r.questions.map((x) => x.id), ["start", "iterate", "recovery", "confidence", "difficulty", "languages"]);
  // The fixture: first edit at 0.1 s, 6.9 s of active work, 2 submissions, the first failed, a better one 3 s later.
  assert.equal(q(r, "start")!.answer, "Across your two solves, your first edit came about 1 s in, then 7 s of active work to the solve.");
  assert.match(q(r, "start")!.note!, /^Active work counts/, "active work is explained once, on its first use");
  assert.equal(q(r, "difficulty")!.note, null);
  assert.equal(q(r, "iterate")!.answer, "Across your two solves, each took 2 submissions.");
  assert.equal(q(r, "iterate")!.detail, "You went straight to Submit each time, without running the examples first.");
  assert.deepEqual(q(r, "iterate")!.visual, { kind: "bars", bars: [{ label: "2 submissions", value: 2, display: "2 solves" }] });
  assert.equal(q(r, "recovery")!.answer, "Across your two solves with a failed submission, a better one came about 3 s later, after 1 check in between.");
  assert.equal(q(r, "recovery")!.detail, "Both your solves came after a failed first submission.");
  assert.equal(q(r, "confidence")!.answer, "You felt unsure 2 times; your first submission passed in none of them.");
  assert.equal(q(r, "rewrite"), undefined, "keystroke-size buckets are not revision style");
  assert.equal(q(r, "difficulty")!.answer, "Easy 7 s, medium 7 s of active work.");
  assert.equal(q(r, "languages")!.answer, "JavaScript and Python so far, 1 solved in each.");
  assert.deepEqual(r.takeaways, [{ id: "recovery", text: "Across two solves, a better submission came about 3 s after a failed one." }]);
  assert.doesNotMatch(visible(r), /thinking|reading|finished \d|open|revisited|waiting|sha256|revision|harness|receipt|evidence/i);
});

test("gapped traces, one difficulty level and no failed first submission leave questions out", () => {
  const a = summary("g1", "JS-001");
  const gapped = { ...a, issues: ["Recording gap."] };
  assert.deepEqual(buildReport(input({ attempts: device(gapped) })).questions, []);
  const r = buildReport(input({ attempts: device(a) }));
  assert.equal(q(r, "difficulty")!.answer, "Your easy solve took 7 s of active work.", "one level is described as it is");
  assert.equal(q(r, "confidence"), undefined, "one answered solve isn't a pattern");
  assert.equal(q(r, "progress"), undefined);
  assert.deepEqual(r.takeaways, [], "one solve has nothing to sum up yet");
  const clean = { ...a, values: { ...a.values, firstSubmit: 1, recoveryTime: null, recoveryChecks: null } };
  assert.equal(q(buildReport(input({ attempts: device(clean) })), "recovery"), undefined);
});

test("the model comparison is one tiny FYI on the iterate answer, only from comparable solves", () => {
  const a = summary("m1", "JS-001");
  const fyi = (receipts: ReportInput["receipts"]) => q(buildReport(input({ attempts: device(a), receipts })), "iterate")!.fyi;
  // Like for like: submissions to the solve on both sides, never your checks beside their submissions.
  assert.equal(fyi({ [a.revision]: [receipt()] }), "On the same challenge, models that solved it needed 2 submissions; you needed 2.");
  assert.equal(fyi({}), null);
  assert.equal(fyi({ [a.revision]: "loading" }), null);
  assert.equal(fyi({ [a.revision]: "unavailable" }), null);
  assert.equal(fyi({ [a.revision]: [receipt({ runtime: { engine: "python" } })] }), null, "a different runtime isn't comparable");
  assert.equal(fyi({ [a.revision]: [receipt({ state: "stopped" })] }), null);
  assert.equal(fyi({ [a.revision]: [receipt({ reasoning: "low", defaultReasoning: "high" })] }), null, "only the default setting counts");
  const r = buildReport(input({ attempts: device(a), receipts: { [a.revision]: [receipt()] } }));
  assert.equal(r.questions.filter((x) => x.fyi).length, 1, "never a comparison section");
});

/** Replace an attempt's submissions with the given verdicts, in order; "pass" solves. */
function withSubmissions(a: AttemptSummary, verdicts: ("pass" | "fail")[], started: string): ReportAttempt {
  const at = (i: number) => new Date(Date.parse(started) + (i + 1) * 1000).toISOString();
  const solved = verdicts.indexOf("pass");
  const timeline = [
    { at: started, label: "started" },
    ...verdicts.flatMap((v, i) => [
      { at: at(i), label: v === "pass" ? "passed: 3/3 checks; 0 static rules" : "failed: 1/3 checks; 0 static rules" },
      ...(i === solved ? [{ at: at(i), label: "completed" }] : []),
    ]),
  ];
  return { ...a, started, timeline, completed: solved >= 0, values: { ...a.values, submissions: verdicts.length }, source: "device" };
}

test("a later solve with fewer submissions to solve answers the repeat question; otherwise it's left out", () => {
  const first = withSubmissions(summary("r1", "JS-001"), ["fail", "pass"], "2026-10-27T10:00:00.000Z"),
    later = withSubmissions(summary("r2", "JS-001"), ["pass"], "2026-10-28T10:00:00.000Z");
  assert.equal(q(buildReport(input({ attempts: [first, later] })), "repeat")!.answer, "Back on JS-001, you needed 1 submission instead of 2.");
  const other = { ...later, conditions: ["Runtime: {}"] };
  assert.equal(q(buildReport(input({ attempts: [first, other] })), "repeat"), undefined);
});

test("checks after a solve never count as needed: no false improvement, no extra iteration", () => {
  // Solved in 1, then 5 optional submissions; later solved fresh in 2. Totals would read 6 → 2.
  const first = withSubmissions(summary("q1", "JS-001"), ["pass", "fail", "fail", "pass", "pass", "pass"], "2026-10-27T10:00:00.000Z"),
    later = withSubmissions(summary("q2", "JS-001"), ["fail", "pass"], "2026-10-28T10:00:00.000Z");
  assert.equal(first.values.submissions, 6);
  const r = buildReport(input({ attempts: [first, later] }));
  assert.equal(q(r, "repeat"), undefined, "1 to solve, then 2: not an improvement");
  // Checks to solve are 1 and 2, not 6 and 2.
  assert.deepEqual(q(r, "iterate")!.visual, { kind: "bars", bars: [{ label: "1 submission", value: 1, display: "1 solve" }, { label: "2 submissions", value: 1, display: "1 solve" }] });
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

test("a newer partial local trace does not hide an uploaded verified completion", () => {
  const complete = summary("preserved-solve", "JS-001");
  const partial = {
    ...complete,
    completed: false,
    last: "2026-10-28T10:00:00Z",
    issues: ["Attempt start is missing; this may be latest-only or partial history."],
  };
  const merged = mergeEvidence([partial], [complete]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, "uploaded");
  assert.equal(merged[0].completed, true);
  assert.deepEqual(
    merged[0].values,
    complete.values,
    "do not combine partial-derived values into the complete summary",
  );
});

test("known or ambiguous integrity failures cannot be replaced by a clean uploaded subset", () => {
  const complete = summary("integrity-solve", "JS-001");
  for (const issue of ["Conflicting record IDs.", "Non-monotonic source clock.", "Malformed practice data; derived values are unavailable.", "Missing or conflicting source positions."]) {
    const corrupt = { ...complete, completed: false, issues: [issue], last: "2026-10-28T10:00:00Z" };
    const report = buildReport(input({ attempts: mergeEvidence([corrupt], [complete]) }));
    assert.deepEqual(report.questions, [], issue);
    assert.deepEqual(mergeEvidence([complete], [corrupt])[0].issues, [issue], "integrity failures stay withheld in either source order");
  }
});

test("one solved sample describes that solve rather than a developer trait", () => {
  const a = summary("one-sample", "JS-001");
  const r = q(
    buildReport(
      input({
        attempts: device({ ...a, values: { ...a.values, firstSubmit: 1 } }),
      }),
    ),
    "iterate",
  )!;
  assert.match(r.answer, /^This solve took/);
  assert.doesNotMatch(r.answer, /mostly|one.shot|typical|you iterate/i);
});

test("the languages invitation sits on the languages answer until answered; a guess doesn't count", () => {
  const attempts = device(
    summary("usual-js", "JS-001"),
    summary("other-py", "PY-001", revB),
  );
  const missing = buildReport(input({ attempts }));
  assert.equal(missing.languagesInvite, true);
  assert.ok(q(missing, "languages"), "invites only beside an answer it groups");
  assert.equal(q(missing, "familiarity"), undefined);
  const filled = buildReport(
    input({ attempts, profile: { languages: ["javascript"] } }),
  );
  assert.equal(filled.languagesInvite, false);
  const answer = q(filled, "familiarity")!;
  assert.match(answer.answer, /usual languages.*outside them/);
  assert.equal(answer.fyi, null);
  const empty = buildReport(input({}));
  assert.equal(empty.languagesInvite, false, "no practice, no languages answer, no invitation");
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
  assert.match(q(r, "iterate")!.answer, /2 submissions/);
  assert.doesNotMatch(JSON.stringify(r) ?? "", /synthetic-artifact|"abc"|secret/, "no code or identifiers reach the report");
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
  assert.equal(q(buildReport(input({ attempts: device(idle) })), "start")!.answer, "Your first edit came 1 s in, then 7 s of active work to the solve.");
  assert.doesNotMatch(JSON.stringify(q(buildReport(input({ attempts: device(idle) })), "start")), /to a solve|6 h/);
});

test("deleting starter code or pasting changes edit sizes, never a claim about what survived", () => {
  const a = summary("s1", "JS-001");
  const starterAndPaste = { ...a, values: { ...a.values, deleted: 400, inserted: 600, smallEdits: 6, largeEdits: 4, paste: 2 } };
  const r = q(buildReport(input({ attempts: device(starterAndPaste) })), "rewrite")!;
  assert.equal(r, undefined, "per-keystroke event sizes are not a revision-style insight");
  assert.doesNotMatch(JSON.stringify(r) ?? "", /stays|kept|surviv|rewrite intent/i);
});

test("repeated solves count each model try once in the FYI", () => {
  const solves = [summary("x1", "JS-001"), summary("x2", "JS-001"), summary("x3", "JS-001"), summary("y1", "PY-001", revB)];
  const receipts = {
    [syntheticRevision]: [receipt({ submissions: 2 })],
    [revB]: [receipt({ submissions: 6, runtime: { engine: "javascript", version: "synthetic" } })],
  };
  // Distinct tries [2, 6] give 4; counting JS-001's try three times would give 2.
  assert.equal(q(buildReport(input({ attempts: device(...solves), receipts })), "iterate")!.fyi, "On the same challenges, models that solved them needed 4 submissions (typical); you needed 2 (typical).");
});

test("an attempt on an earlier revision isn't classified with current difficulty or language", () => {
  const old = summary("h1", "JS-001", `sha256:${"c".repeat(64)}`),
    other = summary("h2", "PY-001", revB);
  const r = buildReport(input({ attempts: device(old, other) }));
  assert.equal(q(r, "difficulty")!.answer, "Your medium solve took 7 s of active work.", "only PY-001 (medium) has matching metadata");
  assert.equal(q(r, "languages")!.answer, "All Python so far: 1 challenge solved.");
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
  assert.doesNotMatch(JSON.stringify(r) ?? "", /stays|%\s*of what you type/);
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

test("recovery measures the way to a better submission, never checks to a solve", () => {
  const a = summary("rc1", "JS-001");
  // recoveryChecks counts checks to the first improvement (0/3 to 1/3), not to 3/3.
  const r = q(buildReport(input({ attempts: device({ ...a, values: { ...a.values, recoveryChecks: 1 } }) })), "recovery")!;
  assert.equal(r.answer, "After the failed submission, a better one came 3 s later, after 1 check in between.");
  assert.doesNotMatch(r.answer, /solve/);
  const none = q(buildReport(input({ attempts: device({ ...a, values: { ...a.values, recoveryTime: null, recoveryChecks: null } }) })), "recovery")!;
  assert.equal(none.answer, "You kept going: 1 solve came after a failed first submission.", "no improvement recorded: only the count");
});

// A richer synthetic catalog: C-001 comes first in catalog order, as on the live site.
const rich = [
  challenge("C-001", "c", "easy"),
  ...["JS-001", "JS-002", "JS-003", "JS-004", "JS-005", "JS-006"].map((k) => challenge(k, "javascript", "easy")),
  challenge("JS-010", "javascript", "medium"),
  challenge("PY-001", "python", "medium", revB),
];
/** A synthetic clean solve: submissions in order ("pass" solves), active work to it, an optional answer. */
function solve(
  attempt: string,
  key: string,
  o: { day: number; active: number; verdicts?: ("pass" | "fail")[]; examples?: boolean; confidence?: string; revision?: string },
): ReportAttempt {
  const started = new Date(Date.parse("2026-10-01T10:00:00Z") + o.day * 86_400_000).toISOString();
  const verdicts = o.verdicts ?? ["pass"];
  const base = withSubmissions(summary(attempt, key, o.revision), verdicts, started);
  const failedFirst = verdicts[0] === "fail";
  return {
    ...base,
    last: started,
    timeline: o.examples ? [base.timeline[0], { at: started, label: "examples: result" }, ...base.timeline.slice(1)] : base.timeline,
    answers: o.confidence ? { confidence: o.confidence } : {},
    values: { ...base.values, activeToSolve: o.active, firstSubmit: failedFirst ? 0 : 1, recoveryTime: failedFirst ? 90_000 : null, recoveryChecks: failedFirst ? 1 : null },
  };
}
const MIN = 60_000;

test("two comparable solves are described as they are: scoped, never a trait", () => {
  const r = buildReport(input({ catalog: rich, attempts: [solve("t1", "JS-001", { day: 0, active: 9 * MIN }), solve("t2", "JS-002", { day: 1, active: 4 * MIN })] }));
  assert.equal(q(r, "progress")!.answer, "Across your two easy JavaScript challenges, the second took 4 min of active work; the first took 9 min.");
  assert.deepEqual(q(r, "progress")!.visual, { kind: "bars", bars: [{ label: "JS-001", value: 9 * MIN, display: "9 min" }, { label: "JS-002", value: 4 * MIN, display: "4 min" }] });
  assert.equal(r.takeaways[0].text, "Across your two easy JavaScript challenges: 9 min → 4 min of active work.");
  assert.doesNotMatch(visible(r), /you are|you're (a|an) |always|never fail|getting faster|typically/i, "two solves are not a habit");
});

test("four or more comparable solves compare the earlier half with the later half", () => {
  const times = [12, 10, 6, 5];
  const attempts = times.map((m, i) => solve(`f${i}`, `JS-00${i + 1}`, { day: i, active: m * MIN }));
  const r = buildReport(input({ catalog: rich, attempts }));
  assert.equal(q(r, "progress")!.answer, "You're getting faster at easy JavaScript: about 11 min of active work per solve at first, 6 min lately.");
  assert.equal(r.takeaways[0].text, "Faster at easy JavaScript lately: 11 min → 6 min of active work per solve.");
  const steady = buildReport(input({ catalog: rich, attempts: [10, 11, 10, 10].map((m, i) => solve(`s${i}`, `JS-00${i + 1}`, { day: i, active: m * MIN })) }));
  assert.match(q(steady, "progress")!.answer, /^Steady at easy JavaScript/);
  assert.equal(steady.takeaways.some((t) => t.id === "progress"), false, "no change, no headline");
});

test("getting faster compares different challenges at one level; a repeat or another level isn't in it", () => {
  const r = buildReport(input({
    catalog: rich,
    attempts: [
      solve("d1", "JS-001", { day: 0, active: 9 * MIN }),
      solve("d2", "JS-001", { day: 1, active: 2 * MIN }),
      solve("d3", "JS-010", { day: 2, active: 1 * MIN }),
    ],
  }));
  assert.equal(q(r, "progress"), undefined, "JS-001 twice is a repeat; JS-010 is medium");
});

test("confidence beside the first submission is told in counts, from answers that exist", () => {
  const attempts = [
    solve("c1", "JS-001", { day: 0, active: MIN, confidence: "sure" }),
    solve("c2", "JS-002", { day: 1, active: MIN, confidence: "sure" }),
    solve("c3", "JS-003", { day: 2, active: MIN, confidence: "unsure", verdicts: ["fail", "pass"] }),
    solve("c4", "JS-004", { day: 3, active: MIN }),
  ];
  const c = q(buildReport(input({ catalog: rich, attempts })), "confidence")!;
  assert.equal(c.answer, "When you felt sure, your first submission passed 2 of 2 times; when unsure, 0 of 1.");
  assert.deepEqual(c.visual, { kind: "bars", bars: [{ label: "sure", value: 1, display: "2 of 2 passed first" }, { label: "unsure", value: 0, display: "0 of 1 passed first" }] });
  assert.doesNotMatch(c.answer + c.note, /calibrat|overconfident|score|%/i);
});

test("one shot or iterate is told in submissions to the solve, with whether the examples ran first", () => {
  const oneShot = [0, 1, 2].map((d) => solve(`o${d}`, `JS-00${d + 1}`, { day: d, active: MIN, examples: d < 2 }));
  const r = q(buildReport(input({ catalog: rich, attempts: oneShot })), "iterate")!;
  assert.equal(r.answer, "Mostly one shot: 3 of 3 solves passed on the first submission.");
  assert.equal(r.detail, "You ran the examples before submitting in 2 of 3 solves.");
  const iterating = [0, 1, 2].map((d) => solve(`i${d}`, `JS-00${d + 1}`, { day: d, active: MIN, verdicts: ["fail", "fail", "pass"], examples: true }));
  const i = q(buildReport(input({ catalog: rich, attempts: iterating })), "iterate")!;
  assert.equal(i.answer, "You iterate: about 3 submissions per solve, typically.");
  assert.equal(i.detail, "You ran the examples before submitting every time.");
});

test("the model FYI uses only your solves of the challenges models solved", () => {
  const matched = solve("m1", "JS-001", { day: 0, active: MIN }),
    unmatched = solve("m2", "JS-002", { day: 1, active: MIN, verdicts: ["fail", "fail", "fail", "fail", "pass"], revision: revB });
  const r = buildReport(input({ catalog: rich, attempts: [matched, unmatched], receipts: { [syntheticRevision]: [receipt({ submissions: 1 })] } }));
  assert.equal(q(r, "iterate")!.fyi, "On the same challenge, models that solved it needed 1 submission; you needed 1.");
});

test("languages read as challenges solved and in progress, never an unexplained duration", () => {
  const open = { ...summary("lo", "PY-001", revB), completed: false, source: "device" as const };
  const tiny = solve("l1", "JS-001", { day: 0, active: 900 });
  const r = buildReport(input({ catalog: rich, attempts: [tiny, solve("l2", "JS-002", { day: 1, active: 1200 }), open] }));
  const l = q(r, "languages")!;
  assert.equal(l.answer, "Mostly JavaScript (2 solved), then Python (0 solved).");
  assert.deepEqual(l.visual, { kind: "bars", bars: [{ label: "JavaScript", value: 2, display: "2 solved" }, { label: "Python", value: 1, display: "1 in progress" }] });
  assert.doesNotMatch(JSON.stringify(l), /\d+ s\b|min\b/);
});

test("the next challenge follows your latest solve's language, as practice does, not catalog order", () => {
  const two = [solve("n1", "JS-001", { day: 0, active: MIN }), solve("n2", "JS-002", { day: 1, active: MIN })];
  const progress = progressOf({ "JS-001": { completedAt: "2026-10-01T10:05:00Z", completions: 1 }, "JS-002": { completedAt: "2026-10-02T10:05:00Z", completions: 1 } });
  assert.deepEqual(buildReport(input({ catalog: rich, progress, attempts: two })).next, { label: "Next: JS-003 · Synthetic JS-003", href: "/challenges/JS-003" });
  const py = [...two, solve("n3", "PY-001", { day: 2, active: MIN, revision: revB })];
  assert.equal(buildReport(input({ catalog: rich, attempts: py, profile: { languages: ["javascript"] } })).next?.href, "/challenges/JS-010", "nothing left in Python: your languages, at the same level");
  const resume = progressOf({ ...progress, "JS-004": { completedAt: null, completions: 0 } });
  assert.equal(buildReport(input({ catalog: rich, progress: { ...progress, ...resume }, attempts: two })).next?.href, "/challenges/JS-004", "an unfinished attempt still comes first");
});

test("a rich history leads with at most three takeaways, each from an answer below", () => {
  const attempts = [
    ...[14, 12, 7, 6].map((m, i) => solve(`r${i}`, `JS-00${i + 1}`, { day: i, active: m * MIN, verdicts: i % 2 ? ["pass"] : ["fail", "pass"], confidence: i % 2 ? "sure" : "unsure", examples: true })),
    solve("r5", "PY-001", { day: 5, active: 20 * MIN, revision: revB, verdicts: ["fail", "fail", "pass"], confidence: "fairly" }),
  ];
  const r = buildReport(input({ catalog: rich, attempts }));
  assert.deepEqual(r.takeaways.map((t) => t.id), ["progress", "recovery", "confidence"]);
  for (const t of r.takeaways) assert.ok(q(r, t.id), `${t.id} is answered below`);
  assert.equal(r.takeaways[2].text, "When you felt sure, your first submission passed 2 of 3 times; when unsure, 0 of 2.");
  assert.deepEqual(r.questions.map((x) => x.id), ["start", "progress", "iterate", "recovery", "confidence", "difficulty", "languages"]);
  assert.doesNotMatch(visible(r), /sha256|revision|harness|receipt|percentile|evidence|reading|thinking/i);
});
