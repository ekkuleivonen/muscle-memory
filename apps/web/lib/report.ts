/**
 * The /stats report: six adaptive chapters built only from recorded evidence (ENG-374).
 * Pure and deterministic. A chapter without supporting evidence is left out, never padded with
 * zeroes, and every statement names what it is based on. See docs/developer-profile.md.
 */
import type { AttemptSummary } from "../../../packages/developer-profile/derive";
import { SMALL_EDIT_UNITS } from "../../../packages/developer-profile/registry";
import {
  receiptMatch,
  type ModelReceipt,
} from "../../../packages/model-runs/receipts";
import { defaultComparisons } from "../../../packages/model-runs/comparison";
import { languageLabel, type ChallengeSummary } from "./challenges";
import { matchingGroup, type CohortRead } from "../../../packages/statistics/cohort";
import type { Profile } from "./profile";
import type { Progress } from "./progress";

export type Source = "device" | "uploaded";
export type ReportAttempt = AttemptSummary & { source: Source };

/**
 * Descriptive cut-offs for chapter 3's headline. They choose which true sentence leads; they
 * are not norms, scores or a personality type, and both underlying numbers are always shown.
 */
export const SMALL_STEP_SHARE = 0.75;
export const LARGE_STEP_SHARE = 0.3;
export const FREQUENT_CHECKS = 3;
/** At most this many tasks in the model comparison, so receipt reads stay bounded. */
export const COMPARISON_TASKS = 3;

/** One attempt per attempt/revision: the trace with the later last observation wins, the device on a tie. */
export function mergeEvidence(
  device: readonly AttemptSummary[],
  uploaded: readonly AttemptSummary[],
): ReportAttempt[] {
  const merged = new Map<string, ReportAttempt>();
  for (const [source, list] of [
    ["uploaded", uploaded],
    ["device", device],
  ] as const)
    for (const a of list) {
      const key = JSON.stringify([a.attempt, a.revision]);
      const prior = merged.get(key);
      if (!prior || a.last >= prior.last) merged.set(key, { ...a, source });
    }
  return [...merged.values()].sort(
    (a, b) =>
      (a.started ?? a.last).localeCompare(b.started ?? b.last) ||
      a.attempt.localeCompare(b.attempt),
  );
}


export type Outcome = "completed" | "unfinished";
export interface ChallengeOutcome {
  key: string;
  title: string;
  language: string;
  outcome: Outcome;
  revisited: boolean;
  resumable: boolean;
  /** Finished only according to uploaded history; this device's progress doesn't show it. */
  fromUploads: boolean;
}
export interface OutcomesChapter {
  id: "outcomes";
  title: "Could you still do it?";
  headline: string;
  /** A short label when the person said AI does much of their coding; the full sentence is in the details. */
  aiNote: string | null;
  /** With nothing finished yet, the open challenge to resume, right beside the opening message. */
  resume: { label: string; href: string } | null;
  heroes: { value: string; label: string }[];
  languages: { language: string; label: string; items: ChallengeOutcome[] }[];
  unexplored: number;
  /** At most one short line of context a player needs to read the finding correctly. */
  note: string | null;
}
export type MarkerKind =
  | "start"
  | "resume"
  | "leave"
  | "examples"
  | "pass"
  | "fail"
  | "error"
  | "done"
  | "gap";
export interface Marker {
  kind: MarkerKind;
  /** Position on the track, 0–1, with long absences shortened. */
  x: number;
  label: string;
  passed?: number;
  total?: number;
}
export interface StoryChapter {
  id: "story";
  /** The approved title only when the attempt actually turned; otherwise a plain one. */
  title: "It wasn't a straight line." | "How one attempt went.";
  challenge: string;
  headline: string;
  markers: Marker[];
  submissions: { passed: number; total: number; result: string }[];
  breaks: number;
  /** At most one short line of context a player needs to read the finding correctly. */
  note: string | null;
}
export interface HabitChapter {
  id: "habits";
  title: "You have a way of working." | "How you worked.";
  headline: string;
  small: number;
  large: number;
  checks: { challenge: string; checks: number }[];
  editsBetween: number | null;
  returned: string[];
  /** At most one short line of context a player needs to read the finding correctly. */
  note: string | null;
}
export type Cell =
  | { kind: "solved"; note: string }
  | { kind: "not-solved"; note: string }
  | { kind: "open"; note: string };
export interface ComparisonRow {
  challenge: string;
  revision: string;
  you: Cell;
  models: { model: string; cell: Cell; receipt: ModelReceipt }[];
  /** A real suppressed figure for other adults, or null (the column is then left out). */
  people: string | null;
}
export interface ComparisonChapter {
  id: "minds";
  title: "Same challenge. Different minds.";
  headline: string;
  rows: ComparisonRow[];
  columns: string[];
  people: boolean;
  /** At most one short line of context a player needs to read the finding correctly. */
  note: string | null;
}
export interface SurpriseChapter {
  id: "surprise";
  title: "The part you might not have noticed.";
  kind: "quiet-confidence" | "fewer-submissions" | "recovered";
  challenge: string;
  headline: string;
  before: { label: string; value: string };
  after: { label: string; value: string };
  /** At most one short line of context a player needs to read the finding correctly. */
  note: string | null;
}
export interface NextChapter {
  id: "next";
  title: "What will you find out next?";
  headline: string;
  action: { label: string; href: string } | null;
  why: string;
  profile: { label: string; href: string; why: string } | null;
  shareable: { id: string; text: string }[];
}
export type Chapter =
  | OutcomesChapter
  | StoryChapter
  | HabitChapter
  | ComparisonChapter
  | SurpriseChapter
  | NextChapter;

export type ReceiptState = ModelReceipt[] | "loading" | "unavailable";
export interface ReportInput {
  catalog: readonly ChallengeSummary[];
  progress: Progress;
  attempts: readonly ReportAttempt[];
  profile: Profile | null;
  /** Model receipts by exact revision; absent means not requested. */
  receipts: Readonly<Record<string, ReceiptState>>;
  /** Human cohorts by exact revision; absent while cohorts are switched off. */
  cohorts?: Readonly<Record<string, CohortRead | "loading" | "unavailable">>;
}
export interface Report {
  /** Nothing started on this device or in uploaded history. */
  empty: boolean;
  chapters: Chapter[];
  /** Exact revisions chapter 4 wants model receipts for. */
  comparisonRevisions: { challenge: string; revision: string }[];
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const median = (values: number[]) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b),
    i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
const number = (n: number) =>
  Number.isInteger(n) ? `${n}` : n.toFixed(1).replace(/\.0$/, "");
const checks = (a: AttemptSummary) =>
  (a.values.examples ?? 0) + (a.values.submissions ?? 0);
const clean = (a: AttemptSummary) => !a.issues.length;

const SUBMITTED = /^(passed|failed|errored|cancelled): (\d+)\/(\d+) checks; (\d+) static rules$/;
export function submissions(a: AttemptSummary) {
  return a.timeline.flatMap((t) => {
    const m = SUBMITTED.exec(t.label);
    return m
      ? [{ result: m[1], passed: +m[2], total: +m[3], rules: +m[4], at: t.at }]
      : [];
  });
}

function outcomes(input: ReportInput): {
  chapter: OutcomesChapter | null;
  rows: ChallengeOutcome[];
} {
  const { catalog, progress, attempts, profile } = input;
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const keys = new Set([
    ...Object.keys(progress),
    ...attempts.map((a) => a.challenge),
  ]);
  const rows: ChallengeOutcome[] = [...keys]
    .filter((key) => byKey.has(key))
    .map((key) => {
      const c = byKey.get(key)!,
        p = progress[key],
        own = attempts.filter((a) => a.challenge === key);
      const completed =
        (p?.completions ?? 0) > 0 || own.some((a) => a.completed);
      const attemptIds = new Set(own.map((a) => a.attempt));
      if (p) attemptIds.add(p.attempt);
      return {
        key,
        title: c.title,
        language: c.language ?? "any",
        outcome: completed ? ("completed" as const) : ("unfinished" as const),
        revisited:
          (p?.completions ?? 0) > 1 ||
          attemptIds.size > 1 ||
          own.some((a) => a.practice === "repeat"),
        resumable: !!p && !p.completedAt && c.runnable,
        fromUploads: completed && !((p?.completions ?? 0) > 0),
      };
    })
    .sort((a, b) => a.language.localeCompare(b.language) || a.key.localeCompare(b.key));
  if (!rows.length) return { chapter: null, rows };
  const done = rows.filter((r) => r.outcome === "completed").length,
    open = rows.length - done,
    revisited = rows.filter((r) => r.revisited).length;
  const languages = [...new Set(rows.map((r) => r.language))];
  const headline =
    done === 0
      ? `You've started ${plural(rows.length, "challenge")}. ${rows.length === 1 ? "It's" : "They're"} still open.`
      : done === rows.length
        ? rows.length === 1
          ? "You finished the challenge you started."
          : `You finished all ${rows.length} challenges you started.`
        : `You finished ${done} of the ${rows.length} challenges you started.`;
  const heavy =
    profile?.aiUse === "daily" ||
    profile?.aiShare === "most" ||
    profile?.aiShare === "nearly-all";
  const firsts = attempts.filter(
    (a) => clean(a) && typeof a.values.firstSubmit === "number",
  );
  const heroes: OutcomesChapter["heroes"] = [
    { value: `${done}/${rows.length}`, label: "finished" },
  ];
  if (firsts.length)
    heroes.push({
      value: `${firsts.filter((a) => a.values.firstSubmit === 1).length}/${firsts.length}`,
      label: "passed first try",
    });
  if (revisited)
    heroes.push({ value: `${revisited}`, label: `revisited` });
  else
    heroes.push({
      value: `${languages.length}`,
      label: languages.length === 1 ? "language" : "languages",
    });
  const uploaded = attempts.some((a) => a.source === "uploaded");
  return {
    rows,
    chapter: {
      id: "outcomes",
      title: "Could you still do it?",
      headline,
      aiNote: heavy ? "no AI in this editor" : null,
      resume: (() => {
        const open = done ? undefined : rows.find((r) => r.resumable);
        return open ? { label: `Resume ${open.key}`, href: `/challenges/${open.key}` } : null;
      })(),
      heroes: heroes.slice(0, 3),
      languages: languages.map((language) => ({
        language,
        label: languageLabel(language),
        items: rows.filter((r) => r.language === language),
      })),
      unexplored: catalog.length - rows.length,
      note: open > 0 ? "Open isn't failed: it's work you haven't finished yet." : null,
    },
  };
}

/** Wall-clock checkpoints placed on a track, with long absences shortened to a fixed break. */
const BREAK_MS = 10 * 60 * 1000;
function story(attempts: readonly ReportAttempt[]): StoryChapter | null {
  const scored = attempts
    .map((a) => {
      const subs = submissions(a);
      const failedFirst = subs.length > 1 && subs[0].result !== "passed";
      const score =
        (a.completed && failedFirst ? 4 : 0) +
        (a.completed && checks(a) >= 2 ? 2 : 0) +
        (subs.length >= 1 || checks(a) >= 2 ? 1 : 0) +
        (clean(a) ? 1 : 0);
      return { a, score, subs };
    })
    .filter((s) => s.score >= 2 && s.a.timeline.length >= 3 && clean(s.a))
    .sort(
      (x, y) =>
        y.score - x.score ||
        y.subs.length - x.subs.length ||
        y.a.timeline.length - x.a.timeline.length ||
        y.a.last.localeCompare(x.a.last),
    );
  const pick = scored[0];
  if (!pick) return null;
  const { a, subs } = pick;
  const events = a.timeline
    .map((t) => ({ ...t, ms: Date.parse(t.at) }))
    .filter((t) => Number.isFinite(t.ms))
    .sort((x, y) => x.ms - y.ms);
  // Positions: sum of gaps, each capped at BREAK_MS, so a lunch break doesn't flatten the story.
  let pos = 0,
    breaks = 0;
  const placed = events.map((e, i) => {
    if (i) {
      const gap = e.ms - events[i - 1].ms;
      if (gap > BREAK_MS) breaks++;
      pos += Math.min(gap, BREAK_MS);
    }
    return { ...e, pos };
  });
  const span = pos || 1;
  const markers: Marker[] = [];
  for (const e of placed) {
    const x = e.pos / span;
    const m = SUBMITTED.exec(e.label);
    if (m)
      markers.push({
        kind:
          m[1] === "passed" && +m[4] === 0
            ? "pass"
            : m[1] === "failed" || m[1] === "passed"
              ? "fail"
              : "error",
        x,
        label:
          m[1] === "errored" || m[1] === "cancelled"
            ? `Submission ${m[1]}`
            : `Submitted: ${m[2]}/${m[3]} checks${+m[4] ? `, ${plural(+m[4], "rule")} fired` : ""}`,
        passed: +m[2],
        total: +m[3],
      });
    else if (e.label.startsWith("examples: "))
      markers.push({
        kind: "examples",
        x,
        label:
          e.label === "examples: result"
            ? "Ran the examples"
            : `Examples: ${e.label.slice(10).replace("-", " ")}`,
      });
    else if (e.label === "started")
      markers.push({ kind: "start", x, label: "Started" });
    else if (e.label === "opened" && markers.at(-1)?.kind === "leave")
      markers.push({ kind: "resume", x, label: "Came back" });
    else if (e.label === "closed")
      markers.push({ kind: "leave", x, label: "Left the page" });
    else if (e.label === "completed")
      markers.push({ kind: "done", x, label: "Completed" });
    else if (e.label === "capture-gap")
      markers.push({ kind: "gap", x, label: "Recording gap" });
  }
  const runs = markers.filter((m) => m.kind === "examples").length;
  // Every submission keeps its place: an errored or cancelled one is still a submission.
  const first = subs[0],
    last = subs.at(-1);
  const passAt = subs.findIndex((s) => s.result === "passed" && s.passed === s.total && s.rules === 0);
  const outcome = (s: (typeof subs)[number], which: string) =>
    s.result === "errored"
      ? `${which} submission ended in an error`
      : s.result === "cancelled"
        ? `${which} submission was cancelled`
        : `${which} submission passed ${s.passed} of ${s.total} checks`;
  const turned = a.completed && passAt > 0;
  let headline: string;
  if (turned)
    headline = `On ${a.challenge}, your ${outcome(first, "first")}. ${passAt === 1 ? "The next one" : `${passAt} submissions later, one`} passed them all.`;
  else if (a.completed && runs)
    headline = `On ${a.challenge}, you ran the examples ${plural(runs, "time")} before a submission that passed everything.`;
  else if (a.completed)
    headline = `On ${a.challenge}, you got there in ${plural(subs.length, "submission")}.`;
  else if (last)
    headline =
      last.result === "passed" || last.result === "failed"
        ? `You left ${a.challenge} at ${last.passed} of ${last.total} checks. It's still open.`
        : `On ${a.challenge}, your last ${outcome(last, "").trim()}. It's still open.`;
  else
    headline = `On ${a.challenge}, you ran ${plural(checks(a), "check")} so far. It's still open.`;
  const between = a.values.editsBetweenRuns;
  return {
    id: "story",
    title: turned ? "It wasn't a straight line." : "How one attempt went.",
    challenge: a.challenge,
    headline,
    markers,
    submissions: subs.map(({ passed, total, result }) => ({ passed, total, result })),
    breaks,
    note: null,
  };
}

function habits(attempts: readonly ReportAttempt[]): HabitChapter | null {
  const eligible = attempts.filter(
    (a) =>
      clean(a) &&
      typeof a.values.smallEdits === "number" &&
      typeof a.values.largeEdits === "number" &&
      a.values.smallEdits + a.values.largeEdits > 0,
  );
  if (!eligible.length) return null;
  const small = eligible.reduce((n, a) => n + a.values.smallEdits!, 0),
    large = eligible.reduce((n, a) => n + a.values.largeEdits!, 0);
  const perAttempt = eligible.map((a) => ({
    challenge: a.challenge,
    checks: checks(a),
  }));
  const checkMedian = median(perAttempt.map((p) => p.checks)) ?? 0;
  const between = median(
    eligible.flatMap((a) =>
      typeof a.values.editsBetweenRuns === "number" ? [a.values.editsBetweenRuns] : [],
    ),
  );
  const returned = [
    ...new Set(
      attempts
        .filter((a) => (a.values.returns ?? 0) > 0)
        .map((a) => a.challenge),
    ),
  ];
  const share = small / (small + large);
  const headline =
    share >= SMALL_STEP_SHARE && checkMedian >= FREQUENT_CHECKS
      ? "Small edits, checked as you go."
      : 1 - share >= LARGE_STEP_SHARE
        ? "You write in bigger pieces."
        : returned.length
          ? "You come back to unfinished work."
          : share >= SMALL_STEP_SHARE
            ? "Mostly small edits."
            : "A mix of small edits and bigger pieces.";
  return {
    id: "habits",
    title: headline.startsWith("A mix") ? "How you worked." : "You have a way of working.",
    headline,
    small,
    large,
    checks: perAttempt,
    editsBetween: between,
    returned,
    note: "Bigger pieces include pastes and rewrites; neither means a mistake.",
  };
}

/**
 * A model's single default-setting try, shown only when it is comparable: a decided outcome on the
 * same runtime and diagnostics. Anything else is left out rather than explained.
 */
function modelCell(r: ModelReceipt | null, conditions: readonly string[]): Cell | null {
  if (!r || !["completed", "stopped", "budget", "refused"].includes(r.state)) return null;
  if (receiptMatch(r, conditions) !== "matched") return null;
  return r.state === "completed"
    ? { kind: "solved", note: r.submissions === null ? "" : plural(r.submissions, "submission") }
    : { kind: "not-solved", note: "didn't solve" };
}
/** Other adults on the same revision and conditions, only when a real suppressed figure exists. */
function peopleCell(read: CohortRead | "loading" | "unavailable" | undefined, a: ReportAttempt): string | null {
  if (!read || typeof read !== "object" || read.state !== "ready") return null;
  const group = matchingGroup(read, a.conditions, a.practice === "repeat" ? "repeat" : "first");
  if (!group) return null;
  const solved = `${Math.round(group.solved * 100)}% of adults solved it`;
  return group.submissions ? `${solved} · median ${plural(group.submissions.p50, "submission")}` : solved;
}
function minds(input: ReportInput): {
  chapter: ComparisonChapter | null;
  wanted: Report["comparisonRevisions"];
} {
  const seen = new Set<string>();
  const picked = [...input.attempts]
    .filter((a) => a.revision.startsWith("sha256:"))
    .sort(
      (x, y) =>
        Number(y.completed) - Number(x.completed) || y.last.localeCompare(x.last),
    )
    .filter((a) => {
      const key = `${a.challenge}:${a.revision}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, COMPARISON_TASKS);
  if (!picked.length) return { chapter: null, wanted: [] };
  const wanted = picked.map((a) => ({ challenge: a.challenge, revision: a.revision }));
  const rows: ComparisonRow[] = picked.flatMap((a) => {
    const got = input.receipts[a.revision];
    // One row per model, its declared default setting's first try (shared with practice, ENG-375).
    const models = (Array.isArray(got) ? defaultComparisons(got) : []).flatMap(({ model, receipt }) => {
      const cell = modelCell(receipt, a.conditions);
      return cell && receipt ? [{ model, cell, receipt }] : [];
    });
    const people = peopleCell(input.cohorts?.[a.revision], a);
    if (!models.length && !people) return [];
    const subs = submissions(a);
    const you: Cell = a.completed
      ? { kind: "solved", note: subs.length ? plural(subs.length, "submission") : "" }
      : { kind: "open", note: subs.length ? `${subs.at(-1)!.passed}/${subs.at(-1)!.total} so far` : "not finished" };
    return [{ challenge: a.challenge, revision: a.revision, you, models, people }];
  });
  // Pending or unreadable results and incomparable tries are omitted, not described.
  if (!rows.length) return { chapter: null, wanted };
  const columns = [...new Set(rows.flatMap((r) => r.models.map((m) => m.model)))].sort();
  // One count per model: pooling different models' single tries would read like a rate.
  const tally = new Map<string, { solved: number; tried: number }>();
  for (const m of rows.flatMap((r) => r.models)) {
    const t = tally.get(m.model) ?? { solved: 0, tried: 0 };
    t.tried++;
    if (m.cell.kind === "solved") t.solved++;
    tally.set(m.model, t);
  }
  const named = [...tally].slice(0, 3).map(([model, t]) => `${model} solved ${t.solved} of ${t.tried}`);
  const perModel = tally.size > 3 ? `${named.join(", ")} and ${tally.size - 3} more` : named.join(", ");
  const yours = `You solved ${rows.filter((r) => r.you.kind === "solved").length} of ${rows.length}.`;
  return {
    wanted,
    chapter: {
      id: "minds",
      title: "Same challenge. Different minds.",
      headline: perModel ? `${yours} ${perModel}.` : yours,
      rows,
      columns,
      people: rows.some((r) => r.people),
      note: tally.size ? "Each model result is a single try." : null,
    },
  };
}

function surprise(
  attempts: readonly ReportAttempt[],
  storyChallenge: string | null,
): SurpriseChapter | null {
  const done = attempts.filter((a) => a.completed && clean(a));
  const quiet = done.find(
    (a) =>
      a.values.firstSubmit === 1 &&
      ["unsure", "guessing"].includes(a.answers.confidence ?? ""),
  );
  if (quiet)
    return {
      id: "surprise",
      kind: "quiet-confidence",
      title: "The part you might not have noticed.",
      challenge: quiet.challenge,
      headline: `You said you were ${quiet.answers.confidence === "guessing" ? "guessing" : "unsure"} on ${quiet.challenge}. Your first submission passed every check.`,
      before: { label: "How sure you felt afterwards", value: quiet.answers.confidence },
      after: { label: "First submission", value: "passed everything" },
      note: null,
    };
  const groups = new Map<string, ReportAttempt[]>();
  for (const a of done) {
    const key = JSON.stringify([a.challenge, a.revision, [...a.conditions].sort()]);
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  for (const group of groups.values()) {
    const sorted = group
      .filter((a) => typeof a.values.submissions === "number")
      .sort((x, y) => (x.started ?? x.last).localeCompare(y.started ?? y.last));
    if (sorted.length < 2) continue;
    const earlier = sorted[0],
      later = sorted[sorted.length - 1];
    if (sorted.length >= 2 && later.values.submissions! < earlier.values.submissions!)
      return {
        id: "surprise",
        kind: "fewer-submissions",
        title: "The part you might not have noticed.",
        challenge: later.challenge,
        headline: `Back on ${later.challenge}, you needed ${plural(later.values.submissions!, "submission")} instead of ${earlier.values.submissions}.`,
        before: { label: `First time (${(earlier.started ?? earlier.last).slice(0, 10)})`, value: plural(earlier.values.submissions!, "submission") },
        after: { label: `Latest (${(later.started ?? later.last).slice(0, 10)})`, value: plural(later.values.submissions!, "submission") },
        note: "It's the same challenge, so familiarity helps.",
      };
  }
  const recovered = done.find(
    (a) =>
      a.challenge !== storyChallenge &&
      a.values.firstSubmit === 0 &&
      (a.values.recoveries ?? 0) > 0,
  );
  const first = recovered && submissions(recovered)[0];
  if (recovered && first)
    return {
      id: "surprise",
      kind: "recovered",
      title: "The part you might not have noticed.",
      challenge: recovered.challenge,
      headline: `${recovered.challenge} didn't pass at first. You finished it anyway.`,
      before: { label: "First submission", value: first.result === "errored" ? "an error in the code" : `${first.passed}/${first.total} checks` },
      after: { label: "In the end", value: "passed everything" },
      note: null,
    };
  return null;
}

function next(
  input: ReportInput,
  rows: ChallengeOutcome[],
  shareable: NextChapter["shareable"],
): NextChapter {
  const { catalog, progress, profile } = input;
  const open = rows.find((r) => r.resumable);
  const touched = new Set(rows.map((r) => r.key));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
  const main = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const topics = new Set(
    catalog.filter((c) => touched.has(c.key) && c.language === main).flatMap((c) => [...c.tags]),
  );
  const fresh = catalog.filter((c) => c.runnable && !progress[c.key] && !touched.has(c.key));
  const newTopic = fresh.find((c) => c.language === main && c.tags.some((t) => !topics.has(t)));
  const newLanguage = fresh.find((c) => c.language && !counts.has(c.language));
  let action: NextChapter["action"] = null,
    why: string,
    headline: string;
  if (open) {
    headline = `Finish ${open.key}.`;
    action = { label: `Resume ${open.key} · ${open.title}`, href: `/challenges/${open.key}` };
    why = "It's the open chapter in your story: finishing it shows how the attempt ends, not just how it started.";
  } else if (!rows.length) {
    headline = "Start with one challenge.";
    action = { label: "Pick a language and start", href: "/start" };
    why = "One attempt is enough for your first chapters: what you finished and how it unfolded.";
  } else if (newTopic && (counts.get(main!) ?? 0) < 3) {
    const tag = newTopic.tags.find((t) => !topics.has(t))!;
    headline = `Try ${tag} in ${languageLabel(main)}.`;
    action = { label: `${newTopic.key} · ${newTopic.title}`, href: `/challenges/${newTopic.key}` };
    why = `You haven't tried a ${tag} challenge yet. It adds a fresh task, separate from the ones you know.`;
  } else if (newLanguage) {
    headline = `See how you do in ${languageLabel(newLanguage.language)}.`;
    action = { label: `${newLanguage.key} · ${newLanguage.title}`, href: `/challenges/${newLanguage.key}` };
    why = "A new language shows which habits travel with you.";
  } else if (newTopic) {
    const tag = newTopic.tags.find((t) => !topics.has(t))!;
    headline = `Try ${tag} next.`;
    action = { label: `${newTopic.key} · ${newTopic.title}`, href: `/challenges/${newTopic.key}` };
    why = `You haven't tried a ${tag} challenge yet.`;
  } else {
    const any = fresh[0];
    headline = any ? "Keep going." : "You've tried every challenge here.";
    action = any ? { label: `${any.key} · ${any.title}`, href: `/challenges/${any.key}` } : null;
    why = any
      ? "Each new task adds a chapter."
      : "Come back to one later: a revisit shows what stuck.";
  }
  const profilePrompt =
    rows.length && !profile?.experience
      ? {
          label: "Add your coding experience (optional)",
          href: "/settings/profile/experience",
          why: "It helps compare like with like. Optional, and nothing here depends on it.",
        }
      : null;
  return {
    id: "next",
    title: "What will you find out next?",
    headline,
    action,
    why,
    profile: profilePrompt,
    shareable,
  };
}

export function buildReport(input: ReportInput): Report {
  const { chapter: first, rows } = outcomes(input);
  if (!first)
    return {
      empty: true,
      chapters: [next(input, rows, [])],
      comparisonRevisions: [],
    };
  const chapters: Chapter[] = [first];
  const s = story(input.attempts);
  if (s) chapters.push(s);
  const h = habits(input.attempts);
  if (h) chapters.push(h);
  const { chapter: m, wanted } = minds(input);
  if (m) chapters.push(m);
  const u = surprise(input.attempts, s?.challenge ?? null);
  if (u) chapters.push(u);
  const shareable = [
    { id: "outcomes", text: first.headline },
    ...(h ? [{ id: "habits", text: `My way of working: ${h.headline}` }] : []),
    ...(s ? [{ id: "story", text: s.headline }] : []),
    ...(u ? [{ id: "surprise", text: u.headline }] : []),
  ];
  chapters.push(next(input, rows, shareable));
  return { empty: false, chapters, comparisonRevisions: wanted };
}

/** The share text: only the findings the person ticked, never code, traces or identity. */
export function shareText(
  report: Report,
  selected: ReadonlySet<string>,
  url: string,
): string {
  const next = report.chapters.find((c): c is NextChapter => c.id === "next");
  const lines = (next?.shareable ?? []).filter((s) => selected.has(s.id)).map((s) => `• ${s.text}`);
  return lines.length ? `My Muscle Memory report\n${lines.join("\n")}\n${url}` : "";
}
