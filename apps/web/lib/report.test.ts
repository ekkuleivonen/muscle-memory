import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveAttempts,
  type AttemptSummary,
} from "../../../packages/developer-profile/derive";
import { trace } from "../../../packages/developer-profile/fixtures";
import type { ModelReceipt } from "../../../packages/model-runs/receipts";
import type { ChallengeSummary } from "./challenges";
import type { Progress } from "./progress";
import {
  buildReport,
  mergeEvidence,
  shareText,
  type ComparisonChapter,
  type HabitChapter,
  type NextChapter,
  type OutcomesChapter,
  type ReportAttempt,
  type ReportInput,
  type StoryChapter,
  type SurpriseChapter,
} from "./report";

const challenge = (key: string, language: string, tags: string[] = ["arrays"]) =>
  ({
    key,
    title: `Synthetic ${key}`,
    language,
    tags,
    difficulty: "easy",
    runnable: true,
  }) as unknown as ChallengeSummary;
const catalog = [
  challenge("JS-001", "javascript"),
  challenge("JS-002", "javascript", ["strings"]),
  challenge("PY-001", "python"),
  challenge("PY-002", "python", ["strings"]),
];
const progressOf = (p: Record<string, { completedAt: string | null; completions: number; attempt?: string }>): Progress =>
  Object.fromEntries(
    Object.entries(p).map(([k, v]) => [
      k,
      { attempt: v.attempt ?? `${k}-attempt`, startedAt: "2026-10-27T10:00:00Z", ...v },
    ]),
  );
const summary = (attempt: string, key: string, revision?: string): AttemptSummary =>
  deriveAttempts(trace(attempt, `${attempt}-source`, key, revision), "synthetic-participant")[0];
const device = (...a: AttemptSummary[]): ReportAttempt[] => a.map((x) => ({ ...x, source: "device" as const }));
const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  catalog,
  progress: {},
  attempts: [],
  profile: null,
  receipts: {},
  ...over,
});
const chapter = <T>(report: ReturnType<typeof buildReport>, id: string) =>
  report.chapters.find((c) => c.id === id) as T | undefined;
// Carries ENG-375's defaultReasoning/finalCodeLength; the assertion keeps it valid before and after that type change.
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
  defaultReasoning: null,
  finalCodeLength: null,
  ...over,
  }) as ModelReceipt;

test("a new player gets one inviting empty state, never zero-filled chapters", () => {
  const r = buildReport(input());
  assert.equal(r.empty, true);
  assert.deepEqual(r.chapters.map((c) => c.id), ["next"]);
  const next = r.chapters[0] as NextChapter;
  assert.equal(next.action?.href, "/start");
  assert.equal(next.profile, null, "no profile prompt before any evidence");
  assert.doesNotMatch(JSON.stringify(r), /0\/0|percentile|score/i);
});

test("one unfinished attempt with no trace shows outcome and a resume action only", () => {
  const r = buildReport(input({ progress: progressOf({ "JS-001": { completedAt: null, completions: 0 } }) }));
  assert.equal(r.empty, false);
  assert.deepEqual(r.chapters.map((c) => c.id), ["outcomes", "next"]);
  const o = chapter<OutcomesChapter>(r, "outcomes")!;
  assert.equal(o.headline, "You've started 1 challenge. It's still open.");
  assert.equal(o.unexplored, 3);
  assert.match(o.evidence.caveat!, /isn't failed/);
  assert.equal(chapter<NextChapter>(r, "next")!.action?.href, "/challenges/JS-001");
  assert.deepEqual(o.resume, { label: "Resume JS-001", href: "/challenges/JS-001" }, "resume sits with the opening message");
  assert.deepEqual(r.comparisonRevisions, []);
});

test("rich synthetic evidence tells all six chapters from what was recorded", () => {
  const js = summary("a1", "JS-001"),
    py = summary("a2", "PY-001", `sha256:${"b".repeat(64)}`);
  const r = buildReport(
    input({
      progress: progressOf({
        "JS-001": { completedAt: "2026-10-27T10:00:09Z", completions: 2, attempt: "a1" },
        "PY-001": { completedAt: "2026-10-27T10:00:09Z", completions: 1, attempt: "a2" },
      }),
      attempts: device(js, py),
      receipts: { [js.revision]: [receipt()], [py.revision]: [receipt({ runtime: { engine: "python" } })] },
    }),
  );
  assert.deepEqual(r.chapters.map((c) => c.id), ["outcomes", "story", "habits", "minds", "surprise", "next"]);
  const o = chapter<OutcomesChapter>(r, "outcomes")!;
  assert.equal(o.headline, "You finished all 2 challenges you started.");
  assert.deepEqual(o.heroes[0], { value: "2/2", label: "finished" });
  assert.equal(o.resume, null, "no resume button when nothing is open");
  assert.deepEqual(o.heroes[1], { value: "0/2", label: "passed first try" });
  assert.equal(o.languages.length, 2);
  assert.ok(o.languages[0].items[0].revisited, "two completions are a revisit");

  const s = chapter<StoryChapter>(r, "story")!;
  assert.match(s.headline, /first submission passed 1 of 3 checks\. The next one passed them all\./);
  assert.equal(s.title, "It wasn't a straight line.");
  assert.deepEqual(s.submissions.map((x) => `${x.passed}/${x.total}`), ["1/3", "3/3"]);
  assert.deepEqual(s.markers.map((m) => m.kind), ["start", "fail", "pass", "done"], "opening isn't a return");
  assert.equal(s.markers[0].x, 0);
  assert.equal(s.markers.at(-1)!.x, 1);

  const h = chapter<HabitChapter>(r, "habits")!;
  assert.equal(h.small, 4);
  assert.equal(h.large, 0);
  assert.equal(h.headline, "Mostly small edits.", "2 checks per attempt isn't frequent");

  const m = chapter<ComparisonChapter>(r, "minds")!;
  const jsRow = m.rows.find((x) => x.challenge === "JS-001")!;
  const pyRow = m.rows.find((x) => x.challenge === "PY-001")!;
  assert.equal(jsRow.models[0].cell.kind, "solved");
  assert.equal(pyRow.models[0].cell.kind, "withheld", "a runtime mismatch withholds the outcome");
  assert.match(m.headline, /You solved 2 of 2\. synthetic\/model · high solved 1 of 1\./);
  assert.match(m.evidence.caveat!, /one observed try, not a success rate/);
  assert.match(m.evidence.details.join(" "), /needs an approved minimum group size/);
  assert.doesNotMatch(JSON.stringify(r.chapters), /not enough|too few/, "no cohort result is implied");

  const u = chapter<SurpriseChapter>(r, "surprise")!;
  assert.equal(u.kind, "recovered");
  assert.notEqual(u.challenge, s.challenge, "the surprise doesn't repeat the story");
});

test("quiet confidence leads the surprise only for a clean first-submission pass", () => {
  const a = summary("q1", "JS-001");
  const clean = { ...a, values: { ...a.values, firstSubmit: 1 } };
  const r = buildReport(input({ attempts: device(clean) }));
  const u = chapter<SurpriseChapter>(r, "surprise")!;
  assert.equal(u.kind, "quiet-confidence");
  assert.match(u.evidence.caveat!, /isn't a prediction/);
  const gapped = { ...clean, issues: ["Recording gap."] };
  assert.equal(chapter(buildReport(input({ attempts: device(gapped) })), "surprise"), undefined);
});

test("fewer submissions compares only the same version and conditions", () => {
  const first = summary("r1", "JS-001"),
    later = { ...summary("r2", "JS-001"), started: "2026-10-28T10:00:00Z", answers: {}, values: { ...first.values, submissions: 1, firstSubmit: 1 } };
  const r = buildReport(input({ attempts: device(first, later) }));
  const u = chapter<SurpriseChapter>(r, "surprise")!;
  assert.equal(u.kind, "fewer-submissions");
  assert.match(u.evidence.caveat!, /doesn't show a general change/);
  const other = { ...later, conditions: ["Runtime: {}"] };
  const r2 = buildReport(input({ attempts: device(first, other) }));
  assert.notEqual(chapter<SurpriseChapter>(r2, "surprise")?.kind, "fewer-submissions");
});

test("model cells keep loading, unavailable and missing slots distinct", () => {
  const a = summary("m1", "JS-001");
  const loading = chapter<ComparisonChapter>(buildReport(input({ attempts: device(a), receipts: { [a.revision]: "loading" } })), "minds")!;
  assert.equal(loading.rows[0].state, "loading");
  assert.match(loading.headline, /Checking/);
  const down = chapter<ComparisonChapter>(buildReport(input({ attempts: device(a), receipts: { [a.revision]: "unavailable" } })), "minds")!;
  assert.equal(down.rows[0].state, "unavailable");
  const none = chapter<ComparisonChapter>(
    buildReport(input({ attempts: device(a), receipts: { [a.revision]: [receipt({ state: "missing", submissions: null }), receipt({ model: "other/model", state: "refused" })] } })),
    "minds",
  )!;
  assert.deepEqual(none.rows[0].models.map((m) => m.cell.kind), ["none", "not-solved"]);
  assert.match(none.headline, /other\/model · high solved 0 of 1/);
});

test("stories never form from a trace without checks, and gaps are shortened, not named", () => {
  const a = summary("g1", "JS-001");
  const late = {
    ...a,
    timeline: a.timeline.map((t, i) => (i >= 3 ? { ...t, at: new Date(Date.parse(t.at) + 3 * 3600_000).toISOString() } : t)),
  };
  const s = chapter<StoryChapter>(buildReport(input({ attempts: device(late) })), "story")!;
  assert.equal(s.breaks, 1);
  assert.match(s.evidence.caveat!, /shortened/);
  assert.doesNotMatch(JSON.stringify(s), /thinking|distract|confus/i);
  const quiet = { ...a, completed: false, timeline: a.timeline.slice(0, 2), values: { ...a.values, submissions: 0, examples: 0 } };
  assert.equal(chapter(buildReport(input({ attempts: device(quiet) })), "story"), undefined);
});

test("AI background shapes copy only when the person said so", () => {
  const p = progressOf({ "JS-001": { completedAt: null, completions: 0 } });
  assert.equal(chapter<OutcomesChapter>(buildReport(input({ progress: p })), "outcomes")!.aiNote, null);
  assert.equal(chapter<OutcomesChapter>(buildReport(input({ progress: p, profile: { aiUse: "rarely" } })), "outcomes")!.aiNote, null);
  const o = chapter<OutcomesChapter>(buildReport(input({ progress: p, profile: { aiUse: "daily" } })), "outcomes")!;
  assert.equal(o.aiNote, "no AI in this editor");
  const c = o.evidence.details[0];
  assert.match(c, /editor here offers no AI/);
  assert.doesNotMatch(c, /without AI|unaided|deteriorat/i);
});

test("device and uploaded evidence is deduplicated by attempt and revision", () => {
  const a = summary("d1", "JS-001");
  const older = { ...a, last: "2026-10-27T09:00:00Z" };
  const merged = mergeEvidence([a], [older, summary("d2", "PY-001")]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((x) => x.attempt === "d1")!.source, "device");
  const newer = { ...a, last: "2026-10-28T00:00:00Z" };
  assert.equal(mergeEvidence([a], [newer])[0].source, "uploaded");
  const other = { ...a, revision: `sha256:${"c".repeat(64)}` };
  assert.equal(mergeEvidence([a], [other]).length, 2, "revisions stay separate");
});

test("share text holds only selected safe findings", () => {
  const a = summary("s1", "JS-001");
  const r = buildReport(input({ attempts: device(a) }));
  const next = chapter<NextChapter>(r, "next")!;
  assert.ok(next.shareable.length >= 2);
  assert.equal(shareText(r, new Set(), "https://example.test/"), "");
  const text = shareText(r, new Set([next.shareable[0].id]), "https://example.test/");
  assert.equal(text.split("\n").length, 3);
  assert.doesNotMatch(text, /synthetic-participant|s1|sha256|abc/);
});

test("a cohort is never invented: chapters carry no human percentile or rank", () => {
  const a = summary("c1", "JS-001");
  const r = buildReport(input({ attempts: device(a), progress: progressOf({ "JS-001": { completedAt: "x", completions: 1 } }), receipts: { [a.revision]: [receipt()] } }));
  assert.doesNotMatch(JSON.stringify(r.chapters), /percentile|faster than|top \d|rank|IQ|score/i);
});

test("a finish known only from uploads is marked, not presented as device progress", () => {
  const a = { ...summary("u1", "JS-001"), source: "uploaded" as const };
  const r = buildReport(input({ attempts: [a] }));
  const o = chapter<OutcomesChapter>(r, "outcomes")!;
  assert.equal(o.languages[0].items[0].fromUploads, true);
  assert.match(o.evidence.basis, /1 finished only in your uploads/);
});

test("failed receipt reads never become a claim that no model tried", () => {
  const a = summary("f1", "JS-001"),
    b = summary("f2", "PY-001", `sha256:${"d".repeat(64)}`);
  const all = chapter<ComparisonChapter>(
    buildReport(input({ attempts: device(a, b), receipts: { [a.revision]: "unavailable", [b.revision]: "unavailable" } })),
    "minds",
  )!;
  assert.equal(all.headline, "Model results can't be read right now.");
  assert.equal(all.evidence.basis, "2 challenges you tried. Model results couldn't be read.");
  assert.doesNotMatch(all.evidence.basis, /checked against|matched/);
  assert.doesNotMatch(all.headline, /No model/);
  const some = chapter<ComparisonChapter>(
    buildReport(input({ attempts: device(a, b), receipts: { [a.revision]: [], [b.revision]: "unavailable" } })),
    "minds",
  )!;
  assert.match(some.headline, /challenges that could be read; 1 couldn't be read right now/);
  const mixed = chapter<ComparisonChapter>(
    buildReport(input({ attempts: device(a, b), receipts: { [a.revision]: [receipt()], [b.revision]: "unavailable" } })),
    "minds",
  )!;
  assert.match(mixed.headline, /synthetic\/model · high solved 1 of 1\. 1 couldn't be read right now\./);
  assert.equal(chapter<ComparisonChapter>(buildReport(input({ attempts: device(a), receipts: { [a.revision]: [] } })), "minds")!.headline,
    "No model has a comparable try on these exact challenges yet.");
});

test("errored and cancelled submissions keep their place in the story", () => {
  const a = summary("e1", "JS-001");
  const at = (s: number) => new Date(Date.parse("2026-10-27T10:00:00Z") + s * 1000).toISOString();
  const withSubs = (labels: string[], completed = true) => ({
    ...a,
    completed,
    timeline: [
      { at: at(0), label: "started" },
      ...labels.map((label, i) => ({ at: at(10 + i * 10), label })),
      ...(completed ? [{ at: at(100), label: "completed" }] : []),
    ],
  });
  const failErrorPass = withSubs([
    "failed: 1/3 checks; 0 static rules",
    "errored: 0/3 checks; 0 static rules",
    "passed: 3/3 checks; 0 static rules",
  ]);
  const s = chapter<StoryChapter>(buildReport(input({ attempts: device(failErrorPass) })), "story")!;
  assert.equal(s.headline, "On JS-001, your first submission passed 1 of 3 checks. 2 submissions later, one passed them all.");
  assert.deepEqual(s.submissions.map((x) => x.result), ["failed", "errored", "passed"]);
  assert.deepEqual(s.markers.map((m) => m.kind), ["start", "fail", "error", "pass", "done"]);
  const errorFirst = withSubs(["errored: 0/3 checks; 0 static rules", "passed: 3/3 checks; 0 static rules"]);
  assert.match(
    chapter<StoryChapter>(buildReport(input({ attempts: device(errorFirst) })), "story")!.headline,
    /your first submission ended in an error\. The next one passed them all\./,
  );
  const openErr = withSubs(["failed: 2/3 checks; 0 static rules", "cancelled: 0/3 checks; 0 static rules"], false);
  assert.match(
    chapter<StoryChapter>(buildReport(input({ attempts: device(openErr) })), "story")!.headline,
    /your last submission was cancelled\. It's still open\./,
  );
});

test("the real uploaded-history projection flows into the report beside device evidence", async () => {
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
  const page = historyResult(
    "synthetic-participant",
    historyWindow({ from: "2026-10-27", to: "2026-10-27", after: "" }),
    rows,
  );
  assert.equal(page.attempts.length, 2);
  // The device still holds only the latest attempt; the older one survives only in uploads.
  const device = deriveAttempts(latest, "synthetic-participant");
  const merged = mergeEvidence(device, page.attempts);
  assert.equal(merged.length, 2, "the shared attempt is counted once");
  assert.deepEqual(merged.map((a) => [a.attempt, a.source]), [
    ["latest-attempt", "device"],
    ["older-attempt", "uploaded"],
  ]);
  const r = buildReport(
    input({
      attempts: merged,
      progress: progressOf({ "JS-001": { completedAt: "2026-10-27T10:00:09Z", completions: 1, attempt: "latest-attempt" } }),
    }),
  );
  const o = chapter<OutcomesChapter>(r, "outcomes")!;
  assert.match(o.evidence.basis, /from this device and your uploads/);
  assert.ok(o.languages[0].items[0].revisited, "two attempts on one challenge is a revisit");
  assert.ok(chapter<StoryChapter>(r, "story"));
  assert.doesNotMatch(JSON.stringify(r), /synthetic-artifact|"abc"|secret/, "no code or identifiers reach the report");
});

test("two reasoning settings of one model stay distinct in the headline", () => {
  const a = summary("t1", "JS-001");
  const m = chapter<ComparisonChapter>(
    buildReport(input({ attempts: device(a), receipts: { [a.revision]: [receipt({ reasoning: "high" }), receipt({ reasoning: "low", state: "stopped" })] } })),
    "minds",
  )!;
  assert.match(m.headline, /synthetic\/model · high solved 1 of 1, synthetic\/model · low solved 0 of 1/);
  assert.equal(m.evidence.basis, "1 challenge you tried, checked against model tries on the exact same version.");
});
