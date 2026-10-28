import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveAttempts, type AttemptSummary } from "../../../packages/developer-profile/derive";
import { trace, syntheticRevision } from "../../../packages/developer-profile/fixtures";
import type { ChallengeSummary } from "./challenges";
import type { Progress } from "./progress";
import { buildReport, duration, mergeEvidence, shareText, SLICES, type Question, type ReportAttempt, type ReportInput } from "./report";

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
const input = (over: Partial<ReportInput> = {}): ReportInput => ({ catalog, progress: {}, attempts: [], profile: null, ...over });
const q = (r: ReturnType<typeof buildReport>, id: Question["id"] | "rewrite") => r.questions.find((x) => x.id === id);
/** What the report says about the player: answers, details and takeaways (not the question titles). */
const said = (r: ReturnType<typeof buildReport>) => [...r.takeaways.map((t) => t.text), ...r.questions.flatMap((x) => [x.answer, x.detail])].join(" ");
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
  // The fixture: first edit at 0.1 s, 6.9 s of active editing, 2 submissions, the first failed, a better one 3 s later.
  assert.equal(q(r, "start")!.answer, "Across your two solves, your first edit came about 1 s in, then about 7 s of active editing to the solve.");
  assert.match(q(r, "start")!.note!, /^Active editing counts/, "active editing is explained once, on its first use");
  assert.equal(q(r, "difficulty")!.note, null);
  assert.equal(q(r, "iterate")!.answer, "Across your two solves, none passed on the first submission; a typical one took 2 submissions.");
  assert.equal(q(r, "iterate")!.detail, null, "the fixture records no example runs, so nothing is said about them");
  // Two solves: each one's submissions in order, a miss then the pass.
  assert.deepEqual(q(r, "iterate")!.visual, {
    kind: "dots",
    legend: ["passed", "didn't pass"],
    rows: [
      { label: "JS-001", marks: [false, true], display: "2 submissions" },
      { label: "PY-001", marks: [false, true], display: "2 submissions" },
    ],
  });
  // Two languages split the challenges worked on: a ring, each challenge in exactly one slice.
  assert.deepEqual(q(r, "languages")!.visual, {
    kind: "pie",
    whole: "Challenges worked on, by language",
    parts: [{ label: "JavaScript", value: 1, display: "1 solved" }, { label: "Python", value: 1, display: "1 solved" }],
  });
  // recoveryChecks includes the better check itself: 1 is the next check, not one in between.
  assert.equal(q(r, "recovery")!.answer, "Across your two solves with a failed submission, a better one came about 3 s later, on the next check.");
  assert.equal(q(r, "recovery")!.detail, null, "how often the first failed is iterate's answer, not repeated here");
  assert.equal(q(r, "start")!.visual, null, "two numbers already in the sentence");
  assert.equal(q(r, "confidence")!.answer, "Across your two answered solves, you said you were unsure; the first submission passed in none of them.");
  assert.equal(q(r, "confidence")!.note, "You answered after the result, so it may colour the answer.");
  assert.equal(q(r, "rewrite"), undefined, "keystroke-size buckets are not revision style");
  assert.equal(q(r, "difficulty")!.answer, "Across your two solves, active editing to the solve: easy 7 s, medium 7 s.");
  assert.equal(q(r, "languages")!.answer, "JavaScript and Python so far, 1 solved in each.");
  assert.deepEqual(r.takeaways, [], "two solves are a first receipt: no summary over them");
  assert.doesNotMatch(visible(r), /thinking|reading|finished \d|open|revisited|waiting|sha256|revision|harness|receipt|evidence/i);
});

test("gapped traces, one difficulty level and no failed first submission leave questions out", () => {
  const a = summary("g1", "JS-001");
  const gapped = { ...a, issues: ["Recording gap."] };
  assert.deepEqual(buildReport(input({ attempts: device(gapped) })).questions, []);
  const r = buildReport(input({ attempts: device(a) }));
  assert.equal(q(r, "difficulty"), undefined, "one level would only repeat the start answer's active editing");
  assert.match(r.discover.find((d) => d.id === "difficulty")!.need, /Solve a (medium|hard) challenge to set beside your easy ones\./);
  assert.equal(q(r, "confidence"), undefined, "one answered solve isn't a pattern");
  assert.equal(q(r, "progress"), undefined);
  assert.deepEqual(r.takeaways, [], "one solve has nothing to sum up yet");
  const clean = { ...a, values: { ...a.values, firstSubmit: 1, recoveryTime: null, recoveryChecks: null } };
  assert.equal(q(buildReport(input({ attempts: device(clean) })), "recovery"), undefined);
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

test("coming back to a challenge shows fewer, the same or more submissions alike, in the same conditions only", () => {
  const first = withSubmissions(summary("r1", "JS-001"), ["fail", "pass"], "2026-10-27T10:00:00.000Z"),
    later = withSubmissions(summary("r2", "JS-001"), ["pass"], "2026-10-28T10:00:00.000Z"),
    same = withSubmissions(summary("r3", "JS-001"), ["fail", "pass"], "2026-10-28T10:00:00.000Z"),
    more = withSubmissions(summary("r4", "JS-001"), ["fail", "fail", "pass"], "2026-10-28T10:00:00.000Z");
  const answer = (...a: ReportAttempt[]) => q(buildReport(input({ attempts: a })), "repeat")?.answer;
  assert.equal(answer(first, later), "Back on JS-001, the latest took 1 submission; the first took 2.");
  assert.equal(answer(first, same), "Back on JS-001, the latest took 2 submissions, the same as the first.");
  assert.equal(answer(first, more), "Back on JS-001, the latest took 3 submissions; the first took 2.", "more is shown as plainly as fewer");
  assert.equal(answer(first, later, { ...more, started: "2026-10-29T10:00:00.000Z" }), "Across your three solves of JS-001, the latest took 3 submissions; the first took 2.");
  assert.equal(q(buildReport(input({ attempts: [first, later] })), "repeat")!.note, "Same challenge, so familiarity with it plays a part.");
  assert.equal(answer(first, { ...later, conditions: ["Runtime: {}"] }), undefined, "different conditions aren't a repeat");
});

test("checks after a solve never count as needed: no false improvement, no extra iteration", () => {
  // Solved in 1, then 5 optional submissions; later solved fresh in 2. Totals would read 6 → 2.
  const first = withSubmissions(summary("q1", "JS-001"), ["pass", "fail", "fail", "pass", "pass", "pass"], "2026-10-27T10:00:00.000Z"),
    later = withSubmissions(summary("q2", "JS-001"), ["fail", "pass"], "2026-10-28T10:00:00.000Z");
  assert.equal(first.values.submissions, 6);
  const r = buildReport(input({ attempts: [first, later] }));
  assert.equal(q(r, "repeat")!.answer, "Back on JS-001, the latest took 2 submissions; the first took 1.", "1 to solve, then 2: optional ones after the solve don't count");
  // Checks to solve are 1 and 2, not 6 and 2: the marks stop at each solve.
  assert.deepEqual(q(r, "iterate")!.visual, {
    kind: "dots",
    legend: ["passed", "didn't pass"],
    rows: [{ label: "JS-001", marks: [true], display: "1 submission" }, { label: "JS-001", marks: [false, true], display: "2 submissions" }],
  });
  const third = withSubmissions(summary("q3", "JS-001"), ["fail", "fail", "pass"], "2026-10-29T10:00:00.000Z");
  // From three solves, the shape is how many took 1, 2, 3–4 or 5+.
  assert.deepEqual(q(buildReport(input({ attempts: [first, later, third] })), "iterate")!.visual, {
    kind: "bars",
    bars: [
      { label: "1 submission", value: 1, display: "1 solve" },
      { label: "2 submissions", value: 1, display: "1 solve" },
      { label: "3–4 submissions", value: 1, display: "1 solve" },
    ],
  });
  const once = withSubmissions(summary("q4", "JS-002"), ["pass"], "2026-10-27T10:00:00.000Z");
  assert.equal(q(buildReport(input({ attempts: [once] })), "iterate")!.visual, null, "one mark would only repeat the sentence");
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
  assert.match(r.answer, /^Your solve /);
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
  // Inside or outside the listed languages, never both: one bar split in two.
  assert.deepEqual(answer.visual, {
    kind: "split",
    whole: "Challenges worked on, inside and outside your usual languages",
    parts: [{ label: "Usual languages", value: 1, display: "1 challenge" }, { label: "Other languages", value: 1, display: "1 challenge" }],
  });
  const allUsual = buildReport(input({ attempts, profile: { languages: ["javascript", "python"] } }));
  assert.equal(q(allUsual, "familiarity")!.visual, null, "one part is the whole: nothing to split");
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
  assert.equal(q(buildReport(input({ attempts: device(idle) })), "start")!.answer, "Your first edit came 1 s in, then 7 s of active editing to the solve.");
  assert.doesNotMatch(JSON.stringify(q(buildReport(input({ attempts: device(idle) })), "start")), /to a solve|6 h/);
});

test("deleting starter code or pasting changes edit sizes, never a claim about what survived", () => {
  const a = summary("s1", "JS-001");
  const starterAndPaste = { ...a, values: { ...a.values, deleted: 400, inserted: 600, smallEdits: 6, largeEdits: 4, paste: 2 } };
  const r = q(buildReport(input({ attempts: device(starterAndPaste) })), "rewrite")!;
  assert.equal(r, undefined, "per-keystroke event sizes are not a revision-style insight");
  assert.doesNotMatch(JSON.stringify(r) ?? "", /stays|kept|surviv|rewrite intent/i);
});

test("an attempt on an earlier revision isn't classified with current difficulty or language", () => {
  const old = summary("h1", "JS-001", `sha256:${"c".repeat(64)}`),
    other = summary("h2", "PY-001", revB);
  const r = buildReport(input({ attempts: device(old, other) }));
  assert.equal(q(r, "difficulty"), undefined, "only PY-001 (medium) has matching metadata: one level");
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
  assert.equal(r.answer, "After the failed submission, a better one came 3 s later, on the next check.");
  assert.doesNotMatch(r.answer, /solve/);
  const none = buildReport(input({ attempts: device({ ...a, values: { ...a.values, recoveryTime: null, recoveryChecks: null } }) }));
  assert.equal(q(none, "recovery"), undefined, "no improvement recorded: the failed first is iterate's answer alone");
  assert.equal(q(none, "iterate")!.answer, "Your solve took 2 submissions; the first didn't pass.");
  const more = q(buildReport(input({ attempts: device({ ...a, values: { ...a.values, recoveryChecks: 3 } }) })), "recovery")!;
  assert.equal(more.answer, "After the failed submission, a better one came 3 s later, within 3 checks.");
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
  o: { day: number; active: number; verdicts?: ("pass" | "fail")[]; examples?: number; confidence?: string; revision?: string; conditions?: string[] },
): ReportAttempt {
  const started = new Date(Date.parse("2026-10-01T10:00:00Z") + o.day * 86_400_000).toISOString();
  const verdicts = o.verdicts ?? ["pass"];
  const base = withSubmissions(summary(attempt, key, o.revision), verdicts, started);
  const failedFirst = verdicts[0] === "fail";
  return {
    ...base,
    last: started,
    timeline: [base.timeline[0], ...Array.from({ length: o.examples ?? 0 }, () => ({ at: started, label: "examples: result" })), ...base.timeline.slice(1)],
    conditions: o.conditions ?? base.conditions,
    answers: o.confidence ? { confidence: o.confidence } : {},
    values: { ...base.values, activeToSolve: o.active, firstSubmit: failedFirst ? 0 : 1, recoveryTime: failedFirst ? 90_000 : null, recoveryChecks: failedFirst ? 1 : null },
  };
}
const MIN = 60_000;

test("two comparable solves are described as they are: scoped, never a trait or an improvement", () => {
  const r = buildReport(input({ catalog: rich, attempts: [solve("t1", "JS-001", { day: 0, active: 9 * MIN }), solve("t2", "JS-002", { day: 1, active: 4 * MIN })] }));
  assert.equal(q(r, "progress")!.answer, "Across your two easy JavaScript challenges, the first took 9 min of active editing and the latest 4 min.");
  assert.match(q(r, "progress")!.note!, /can differ in size, so this describes these solves, not a change in skill/);
  assert.deepEqual(q(r, "progress")!.visual, { kind: "bars", bars: [{ label: "JS-001", value: 9 * MIN, display: "9 min" }, { label: "JS-002", value: 4 * MIN, display: "4 min" }] });
  assert.equal(r.takeaways.some((t) => t.id === "progress"), false, "never a headline");
  assert.doesNotMatch(said(r), /you are|you're (a|an) |always|never fail|faster|slower|improv|getting|mostly|you iterate/i);
});

test("four or more comparable solves set the earlier half beside the later half, either way", () => {
  const at = (times: number[]) => buildReport(input({ catalog: rich, attempts: times.map((m, i) => solve(`f${times.join("")}${i}`, `JS-00${i + 1}`, { day: i, active: m * MIN })) }));
  assert.equal(q(at([12, 10, 6, 5]), "progress")!.answer, "Across your four easy JavaScript challenges, the earlier 2 took about 11 min of active editing each and the later 2 about 6 min.");
  assert.equal(q(at([5, 6, 10, 12]), "progress")!.answer, "Across your four easy JavaScript challenges, the earlier 2 took about 6 min of active editing each and the later 2 about 11 min.", "a slower later observation is shown as plainly");
  assert.equal(q(at([10, 11, 10, 10]), "progress")!.answer, "Across your four easy JavaScript challenges, the earlier 2 and the later 2 took a similar 10 min of active editing each, typically.");
});

test("earlier and later compare first solves of different challenges at one level and setup only", () => {
  const r = buildReport(input({
    catalog: rich,
    attempts: [
      solve("d1", "JS-001", { day: 0, active: 9 * MIN }),
      solve("d2", "JS-001", { day: 1, active: 2 * MIN }),
      solve("d3", "JS-010", { day: 2, active: 1 * MIN }),
      solve("d4", "JS-002", { day: 3, active: 3 * MIN, conditions: ["Editor: CodeMirror; features: syntax-highlighting, vim-keybindings"] }),
    ],
  }));
  assert.equal(q(r, "progress"), undefined, "JS-001 twice is a repeat, JS-010 is medium, and JS-002 had a different editor setup");
  const again = { ...solve("d5", "JS-003", { day: 4, active: MIN }), practice: "repeat" as const };
  assert.equal(q(buildReport(input({ catalog: rich, attempts: [solve("d6", "JS-001", { day: 0, active: MIN }), again] })), "progress"), undefined, "a solve started again isn't a first solve");
});

test("confidence is the after-solve answer beside the first submission, in counts, never a calibration", () => {
  const attempts = [
    solve("c1", "JS-001", { day: 0, active: MIN, confidence: "sure" }),
    solve("c2", "JS-002", { day: 1, active: MIN, confidence: "sure" }),
    solve("c3", "JS-003", { day: 2, active: MIN, confidence: "unsure", verdicts: ["fail", "pass"] }),
    solve("c4", "JS-004", { day: 3, active: MIN }),
  ];
  const c = q(buildReport(input({ catalog: rich, attempts })), "confidence")!;
  assert.equal(c.answer, "Across your three answered solves, the first submission passed in 2 of 2 solves you felt sure about, and 0 of 1 you felt unsure about.");
  assert.equal(c.note, "You answered after the result, so it may colour the answer.");
  // One mark per answered solve under what you said, never a rate.
  assert.deepEqual(c.visual, {
    kind: "dots",
    legend: ["first passed", "first didn't pass"],
    rows: [{ label: "sure", marks: [true, true], display: "2 of 2 passed first" }, { label: "unsure", marks: [false], display: "0 of 1 passed first" }],
  });
  assert.doesNotMatch(c.answer + c.note, /calibrat|overconfident|predict|score|%/i);
});

test("iterate counts submissions and example runs to the solve; runs that failed on our side aren't yours", () => {
  const oneShot = [0, 1, 2].map((d) => solve(`o${d}`, `JS-00${d + 1}`, { day: d, active: MIN, examples: d + 1 }));
  const r = q(buildReport(input({ catalog: rich, attempts: oneShot })), "iterate")!;
  assert.equal(r.answer, "Across your three solves, every first submission passed.");
  assert.equal(r.detail, "You ran the examples about 2 times per solve.");
  const iterating = [0, 1, 2].map((d) => solve(`i${d}`, `JS-00${d + 1}`, { day: d, active: MIN, verdicts: ["fail", "fail", "pass"], examples: 4 }));
  const i = q(buildReport(input({ catalog: rich, attempts: iterating })), "iterate")!;
  assert.equal(i.answer, "Across your three solves, none passed on the first submission; a typical one took 3 submissions.");
  assert.doesNotMatch(i.answer + i.detail, /mostly|you iterate|habit|before submitting/i, "examples before Submit are required, so never a habit");
});

test("example runs and submissions that failed on our side are named and not counted", () => {
  // As derive records it: the first submission never ran, so firstSubmit is unknown.
  const solved = solve("sv", "JS-001", { day: 0, active: MIN, examples: 1 });
  const base = { ...solved, values: { ...solved.values, firstSubmit: null } };
  const at = base.timeline[1].at;
  const flaky = { ...base, timeline: [base.timeline[0], { at, label: "examples: result" }, { at, label: "examples: runner-error" }, { at, label: "submit: runner-error" }, { at, label: "errored: 0/3 checks; 0 static rules" }, { at, label: "passed: 3/3 checks; 0 static rules" }, { at, label: "completed" }] };
  const f = q(buildReport(input({ catalog: rich, attempts: [flaky] })), "iterate")!;
  assert.equal(f.answer, "Your solve took 1 submission, after an earlier one failed on our side.");
  assert.equal(f.detail, "You ran the examples once before the solve. 2 runs failed on our side; they aren't counted.");
});

test("languages read as challenges solved and in progress, never an unexplained duration", () => {
  const open = { ...summary("lo", "PY-001", revB), completed: false, source: "device" as const };
  const tiny = solve("l1", "JS-001", { day: 0, active: 900 });
  const r = buildReport(input({ catalog: rich, attempts: [tiny, solve("l2", "JS-002", { day: 1, active: 1200 }), open] }));
  const l = q(r, "languages")!;
  assert.equal(l.answer, "Across your two solved challenges: JavaScript 2, Python 0.");
  assert.deepEqual(l.visual, {
    kind: "pie",
    whole: "Challenges worked on, by language",
    parts: [{ label: "JavaScript", value: 2, display: "2 solved" }, { label: "Python", value: 1, display: "1 in progress" }],
  });
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

test("a rich history leads with at most three takeaways, each scoped and from an answer below", () => {
  const attempts = [
    ...[14, 12, 7, 6].map((m, i) => solve(`r${i}`, `JS-00${i + 1}`, { day: i, active: m * MIN, verdicts: i % 2 ? ["pass"] : ["fail", "pass"], confidence: i % 2 ? "sure" : "unsure", examples: 2 })),
    solve("r5", "PY-001", { day: 5, active: 20 * MIN, revision: revB, verdicts: ["fail", "fail", "pass"], confidence: "fairly" }),
  ];
  const r = buildReport(input({ catalog: rich, attempts }));
  assert.deepEqual(r.takeaways.map((t) => t.id), ["recovery", "confidence", "iterate"]);
  for (const t of r.takeaways) {
    assert.ok(q(r, t.id), `${t.id} is answered below`);
    assert.notEqual(t.text, q(r, t.id)!.answer, "a compact lead, not the answer's sentence again");
  }
  assert.deepEqual(r.takeaways.map((t) => t.text), [
    "A better submission about 2 min after a failed one (3 solves)",
    "Said sure: 2 of 3 first submissions passed; unsure: 0 of 2",
    "First submission passed in 2 of 5 solves",
  ]);
  assert.deepEqual(r.questions.map((x) => x.id), ["start", "iterate", "recovery", "confidence", "difficulty", "progress", "languages"]);
  assert.equal(q(r, "difficulty")!.answer, "Across your five solves, typical active editing to the solve: easy 10 min, medium 20 min.");
  assert.deepEqual(q(r, "difficulty")!.visual, { kind: "bars", bars: [{ label: "easy", value: 9.5 * MIN, display: "10 min · 4 solves" }, { label: "medium", value: 20 * MIN, display: "20 min · 1 solve" }] });
  assert.doesNotMatch(visible(r), /sha256|revision|harness|receipt|percentile|evidence|reading|thinking/i);
  assert.doesNotMatch(said(r), /faster|improv|mostly|you iterate|you are|always/i, "observations, never traits");
});

test("no model comparison: their receipts count only submissions, and people pass the examples before submitting", () => {
  const r = buildReport(input({ catalog: rich, attempts: [solve("nm1", "JS-001", { day: 0, active: MIN, verdicts: ["fail", "pass"], examples: 1 }), solve("nm2", "JS-002", { day: 1, active: MIN })] }));
  assert.equal(r.questions.filter((x) => x.fyi).length, 0);
  assert.doesNotMatch(visible(r), /model/i);
});

test("still to discover lists every supported question not yet answered, with its real requirement", () => {
  const empty = buildReport(input({ catalog: rich }));
  assert.deepEqual(empty.discover.map((d) => d.id), ["basics", "difficulty", "progress", "recovery", "confidence", "typing", "repeat"]);
  assert.equal(empty.discover[0].question, "How soon you start, how you iterate and your languages");
  // Practice in progress, nothing solved: languages is answered, so the basics line leaves it out.
  const started = buildReport(input({ catalog: rich, attempts: [{ ...summary("ip", "JS-001"), completed: false, source: "device" as const }] }));
  assert.ok(q(started, "languages"));
  assert.equal(started.discover[0].question, "How soon you start and how you iterate");
  assert.equal(empty.discover[0].need, "Your first solve answers these.");
  assert.ok(empty.discover.every((d) => d.action === null), "the start link above is the step; no extra links");
  const needs = empty.discover.map((d) => `${d.question} ${d.need}`).join(" ");
  assert.doesNotMatch(needs, /unlock|play more|model|other players|cohort|percentile/i, "never promises what practice can't provide");
  // Each comparison's real prerequisite, never a blanket "models aren't comparable".
  assert.match(empty.discoverNote!, /^Not compared yet\. Other players: .*privacy controls still under review.*enough comparable players/);
  assert.match(empty.discoverNote!, /AI models: their recorded submissions don't have to pass the examples first.*recorded the same way on the same challenge version\.$/);
  assert.doesNotMatch(empty.discoverNote!, /never|can't be compared|not comparable|latency|faster|smarter/i);
});

test("answered questions are never listed; a missing one names a specific comparable challenge", () => {
  const one = buildReport(input({ catalog: rich, attempts: [solve("u1", "JS-001", { day: 0, active: MIN, confidence: "sure" })] }));
  const answered = new Set(one.questions.map((x) => x.id));
  assert.ok(one.discover.every((d) => !answered.has(d.id as Question["id"])));
  const pace = one.discover.find((d) => d.id === "progress")!;
  assert.equal(pace.need, "Solve another easy JavaScript challenge to set beside your earlier ones.");
  assert.deepEqual(pace.action, { label: "JS-002 · Synthetic JS-002", href: "/challenges/JS-002" });
  assert.equal(one.discover.find((d) => d.id === "confidence")!.need, 'Shows after one more answer to "how sure were you?", an optional question offered now and then after a solve.', "offered now and then, never promised after the next solve");
  assert.deepEqual(one.discover.find((d) => d.id === "repeat")!.action, { label: "Again: JS-001 · Synthetic JS-001", href: "/challenges/JS-001" });
  assert.equal(one.discover.find((d) => d.id === "recovery")!.action, null, "a one-shot solve: nothing to ask for, no link to fail on purpose");
  const two = buildReport(input({ catalog: rich, attempts: [solve("u1", "JS-001", { day: 0, active: MIN }), solve("u2", "JS-002", { day: 1, active: MIN })] }));
  assert.equal(two.discover.find((d) => d.id === "progress"), undefined, "a comparable pair answers pace");
});

test("typing that Vim keybindings make unmeasurable says so, rather than asking for more practice", () => {
  const hjkl = Array.from({ length: 61 }, (_, i) => [200 + i * 100, "hjkl"[i % 4], ""] as [number, string, string]);
  const r = buildReport(input({ attempts: device(withKeys("vd", hjkl, ["syntax-highlighting", "vim-keybindings"])) }));
  assert.equal(r.discover.find((d) => d.id === "typing")!.need, "Not measured while Vim keybindings are on, since their letters can be commands.");
  const plain = buildReport(input({ attempts: device(summary("pl", "JS-001")) }));
  assert.equal(plain.discover.find((d) => d.id === "typing")!.need, "Shows after about 50 characters of code typed by hand; pastes and shortcuts don't count.");
});

/**
 * The fixture's first submission (r1) turned into one that never ran your code: its run failed on
 * our side ("runner-error", verdict "errored") or was cancelled. Derived for real, so `firstSubmit`
 * is what derive says about the first recorded submission.
 */
function voidedFirst(attempt: string, how: "runner-error" | "cancelled"): ReportAttempt {
  const records = trace(attempt, `${attempt}-source`).map((r) => {
    const o = JSON.parse(r.payload);
    if (o.type === "practice.run" && o.data.runId === "r1" && o.data.status === "result") o.data.status = how;
    if (o.type === "practice.submitted" && o.data.runId === "r1") Object.assign(o.data, { result: how === "cancelled" ? "cancelled" : "errored", passed: 0 });
    return { ...r, payload: JSON.stringify(o) };
  });
  return { ...deriveAttempts(records, "synthetic-participant")[0], source: "device" };
}

test("a pass after a submission that never ran is never called a first-submission pass", () => {
  for (const [how, uncounted, answer] of [
    ["runner-error", "1 run failed on our side; they aren't counted.", "Your solve took 1 submission, after an earlier one failed on our side."],
    ["cancelled", "1 submission was cancelled; they aren't counted.", "Your solve took 1 submission, after an earlier one was cancelled."],
  ] as const) {
    const a = voidedFirst(`v-${how}`, how);
    assert.equal(a.values.firstSubmit, null, `derive: a ${how} first submission is ineligible`);
    const r = buildReport(input({ attempts: [a] }));
    assert.equal(q(r, "iterate")!.answer, answer, how);
    assert.equal(q(r, "iterate")!.detail, uncounted);
    assert.equal(q(r, "recovery"), undefined, `${how} isn't a failed submission of yours`);
  }
  // Two solves, one with a voided first submission: the first-submission count says where it ran.
  const r = buildReport(input({ attempts: [voidedFirst("v1", "runner-error"), { ...summary("v2", "JS-002"), source: "device" as const }] }));
  assert.equal(q(r, "iterate")!.answer, "Across your two solves, 0 of 1 first submission with a known result passed; a typical solve took 1.5 submissions.");
});

test("a real failed submission, then one that didn't run, then a pass: the first still failed", () => {
  const base = solve("fv", "JS-001", { day: 0, active: MIN, verdicts: ["fail", "pass"] });
  const at = base.timeline[1].at;
  for (const voided of [
    [{ at, label: "submit: runner-error" }, { at, label: "errored: 0/3 checks; 0 static rules" }],
    [{ at, label: "submit: cancelled" }, { at, label: "cancelled: 0/3 checks; 0 static rules" }],
  ]) {
    const timeline = [base.timeline[0], { at, label: "failed: 1/3 checks; 0 static rules" }, ...voided, { at, label: "passed: 3/3 checks; 0 static rules" }, { at, label: "completed" }];
    const r = buildReport(input({ catalog: rich, attempts: [{ ...base, timeline }] }));
    assert.equal(q(r, "iterate")!.answer, "Your solve took 2 submissions; the first didn't pass.", voided[0].label);
    assert.equal(q(r, "recovery")!.answer, "After the failed submission, a better one came 2 min later, on the next check.", "recovery keeps derive's own meaning");
  }
});

test("a timed-out first submission is an unknown result, not one that didn't run (real trace)", () => {
  const records = trace("to", "to-source").map((r) => {
    const o = JSON.parse(r.payload);
    if (o.type === "practice.run" && o.data.runId === "r1" && o.data.status === "result") o.data.status = "timeout";
    if (o.type === "practice.submitted" && o.data.runId === "r1") Object.assign(o.data, { result: "errored", passed: 0 });
    return { ...r, payload: JSON.stringify(o) };
  });
  const a = deriveAttempts(records, "synthetic-participant")[0];
  assert.deepEqual([a.issues, a.values.firstSubmit], [[], null], "derive: clean, first submission ineligible");
  const r = buildReport(input({ attempts: device(a) }));
  assert.equal(q(r, "iterate")!.answer, "Your solve took 2 submissions; the first one's result isn't known.");
  assert.doesNotMatch(q(r, "iterate")!.answer + (q(r, "iterate")!.detail ?? ""), /didn't run|failed on our side|cancelled|timed? ?out/i, "no invented cause");
  assert.equal(q(r, "recovery"), undefined, "a timeout isn't a failed submission of yours");
});

test("start and build come from one population of solves (real traces)", () => {
  // The first edit only in a second visit: no first edit in the starting visit, and a slower build.
  const records = trace("sv", "first-visit").map((r, i) => {
    if (i < 2) return r;
    const o = JSON.parse(r.payload);
    o.source = { ...o.source, id: "second-visit", sequence: i - 1 };
    o.elapsedMs *= 4;
    if (o.type === "practice.keys") o.data.keys = o.data.keys.map((k: unknown[]) => [(k[0] as number) * 4, ...k.slice(1)]);
    return { ...r, payload: JSON.stringify(o) };
  });
  const later = deriveAttempts(records, "synthetic-participant")[0];
  assert.deepEqual([later.issues, later.values.firstEdit, later.values.activeToSolve], [[], null, 27_600]);
  const stock = summary("stock", "JS-002");
  const r = buildReport(input({ attempts: device(stock, later) }));
  assert.equal(q(r, "start")!.answer, "Your first edit came 1 s in, then 7 s of active editing to the solve.", "the 28 s solve without a first edit isn't mixed in");
});

test("a ring folds languages past the fifth slice into one, so every slice stays readable", () => {
  const langs = ["c", "go", "java", "javascript", "python", "ruby", "php"];
  const many = langs.map((l, i) => challenge(`L-00${i}`, l));
  const attempts = langs.map((_, i) => solve(`m${i}`, `L-00${i}`, { day: i, active: MIN }));
  const v = q(buildReport(input({ catalog: many, attempts })), "languages")!.visual;
  assert.equal(v?.kind, "pie");
  const parts = v!.kind === "pie" ? v!.parts : [];
  assert.equal(parts.length, SLICES);
  assert.deepEqual(parts.at(-1), { label: "3 other languages", value: 3, display: "3 solved" });
  assert.equal(parts.reduce((t, p) => t + p.value, 0), langs.length, "the slices still add up to the whole");
});

test("the share summary is a few counts, never names, times, answers or identity", () => {
  assert.equal(buildReport(input()).share, null, "nothing to share before practice");
  const started = buildReport(input({ attempts: [{ ...summary("o1", "JS-001"), completed: false, source: "device" }] }));
  assert.equal(started.share, null, "nothing to share before a solve");
  const attempts = [
    solve("s1", "JS-001", { day: 0, active: 9 * MIN, confidence: "sure" }),
    solve("s2", "JS-002", { day: 1, active: 4 * MIN, verdicts: ["fail", "pass"], confidence: "unsure" }),
    solve("s3", "PY-001", { day: 2, active: 3 * MIN, revision: revB }),
  ];
  const r = buildReport(input({ catalog: rich, attempts, profile: { languages: ["python"], experience: "5-10" } as never }));
  assert.deepEqual(r.share, {
    solved: 3,
    languages: [{ label: "JavaScript", solved: 2 }, { label: "Python", solved: 1 }],
    firstPassed: { passed: 2, of: 3 },
  });
  const text = shareText(r.share!, "https://example.test");
  assert.equal(
    text,
    [
      "My unaided coding practice on Muscle Memory",
      "",
      "3 challenges solved",
      "  JavaScript  ■■■■■■■■■■ 2",
      "  Python      ■■■■■ 1",
      "First submission passed in 2 of 3 solves",
      "",
      "Keep your coding skills in practice: https://example.test",
    ].join("\n"),
  );
  // No challenge keys or titles, durations, dates, after-solve answers, profile context or ids.
  assert.doesNotMatch(text, /JS-|PY-|Synthetic|\d+ (s|min)\b|2026|sure|unsure|usual|5-10|synthetic-participant|s1|attempt|sha256/);
  const one = shareText({ solved: 1, languages: [{ label: "Go", solved: 1 }], firstPassed: { passed: 0, of: 1 } }, "https://example.test");
  assert.match(one, /^1 Go challenge solved$/m);
  assert.match(one, /^First submission didn't pass$/m);
});

test("a solve on an older revision still counts in the share summary, without a guessed language", () => {
  const old = solve("v1", "JS-001", { day: 0, active: MIN, revision: revB });
  const s = buildReport(input({ catalog: rich, attempts: [old, solve("v2", "JS-002", { day: 1, active: MIN })] })).share!;
  assert.deepEqual(s, { solved: 2, languages: [], firstPassed: { passed: 2, of: 2 } });
  assert.match(shareText(s, "https://example.test"), /^2 challenges solved$/m);
});
