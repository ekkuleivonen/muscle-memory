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
const receipt = (over: Partial<ModelReceipt> = {}): ModelReceipt => ({
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
  ...over,
});

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
  assert.deepEqual(o.heroes[1], { value: "0/2", label: "first submissions passed every check" });
  assert.equal(o.languages.length, 2);
  assert.ok(o.languages[0].items[0].revisited, "two completions are a revisit");

  const s = chapter<StoryChapter>(r, "story")!;
  assert.match(s.headline, /first submission passed 1 of 3 checks\. Next time, all of them did/);
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
  assert.match(m.headline, /Models solved 1 of the 1 comparable try/);
  assert.match(m.evidence.caveat!, /one observed try, not a success rate/);
  assert.match(m.evidence.details.join(" "), /not enough comparable participants/);

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
  assert.match(none.headline, /Models solved 0 of the 1 comparable try/);
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
  assert.equal(chapter<OutcomesChapter>(buildReport(input({ progress: p })), "outcomes")!.context, null);
  assert.equal(chapter<OutcomesChapter>(buildReport(input({ progress: p, profile: { aiUse: "rarely" } })), "outcomes")!.context, null);
  const c = chapter<OutcomesChapter>(buildReport(input({ progress: p, profile: { aiUse: "daily" } })), "outcomes")!.context!;
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
