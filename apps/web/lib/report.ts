/**
 * The /stats report as a portrait (ENG-374, owner direction 27-28 October 2026): a few takeaways,
 * then simple questions about how you code, each answered only from evidence already recorded. A
 * question the evidence can't answer is left out, never filled with zeroes or explained. Small
 * samples are described as what happened in them, never as a trait. Comparisons are at most one
 * matched FYI on the relevant answer, and only when the units really match. Pure and deterministic; see docs/developer-profile.md.
 */
import type { AttemptSummary } from "../../../packages/developer-profile/derive";
import type { ModelReceipt } from "../../../packages/model-runs/receipts";
import { languageLabel, type ChallengeSummary } from "./challenges";
import type { Profile } from "./profile";
import type { Progress } from "./progress";
import { nextProblem } from "./next-problem";

export type Source = "device" | "uploaded";
export type ReportAttempt = AttemptSummary & { source: Source };

/** Keystrokes per word for words per minute, the usual typing-test convention. */
export const KEYS_PER_WORD = 5;
/** derive keeps at most this many checkpoints per attempt. */
const TIMELINE_CAP = 200;
/** Below this many code-character keystrokes a typing rate is too noisy to show. */
export const MIN_TYPED_KEYS = 50;
/** Wording cut-offs, not norms: within these, earlier and later solves read as similar. */
export const FASTER = 0.8;
export const SLOWER = 1.25;
/** At most this many takeaways lead the report. */
export const TAKEAWAYS = 3;

/** One attempt per attempt/revision. A partial trace must not hide a verified completion. */
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
      const usable = (x: AttemptSummary) => x.completed && !x.issues.length;
      // A missing start is known absence; ambiguous positions and integrity warnings stay withheld.
      const integrityFailure = (x: AttemptSummary) => x.issues.some(issue =>
        issue !== "Attempt start is missing; this may be latest-only or partial history.");
      if (
        !prior ||
        integrityFailure(a) || (!integrityFailure(prior) && (
          (usable(a) && !usable(prior)) ||
          (usable(a) === usable(prior) && a.last >= prior.last)))
      )
        merged.set(key, { ...a, source });
    }
  return [...merged.values()].sort(
    (a, b) =>
      (a.started ?? a.last).localeCompare(b.started ?? b.last) ||
      a.attempt.localeCompare(b.attempt),
  );
}

export interface Part {
  label: string;
  value: number;
  display: string;
}
export type Visual =
  | { kind: "bars"; bars: Part[] }
  | { kind: "number"; value: string; unit: string }
  | { kind: "turn"; from: string; to: string }
  /**
   * A whole split into parts that never overlap and add up to it (challenges by language,
   * challenges inside and outside your languages): a ring, or one split bar for two parts.
   * Never for clocks or counts that overlap.
   */
  | { kind: "pie"; whole: string; parts: Part[] }
  | { kind: "split"; whole: string; parts: Part[] }
  /**
   * One mark per item, filled when it passed: each submission of a solve in order, or each
   * answered solve's first submission. `legend` names both marks.
   */
  | { kind: "dots"; legend: [string, string]; rows: { label: string; marks: boolean[]; display: string }[] };
export type QuestionId =
  | "start"
  | "progress"
  | "iterate"
  | "recovery"
  | "confidence"
  | "difficulty"
  | "languages"
  | "familiarity"
  | "typing"
  | "repeat";
/** Every question the report can answer, by id: the answers and the "still to discover" list share them. */
export const QUESTIONS: Record<QuestionId, string> = {
  start: "How soon do you start, and how long do you build?",
  progress: "How did later solves compare with earlier ones?",
  iterate: "Do you iterate or go for one shot?",
  recovery: "What happens after a failed submission?",
  confidence: "How sure were you, and how did the first submission go?",
  difficulty: "How long do harder challenges take you?",
  languages: "Which languages do you actually code in?",
  familiarity: "Your usual languages or something new?",
  typing: "How fast do you type when you're coding?",
  repeat: "Did coming back to a challenge change anything?",
};
/** Short labels for the first receipt, where one or two solves read as lines rather than chapters. */
export const SHORT: Record<QuestionId, string> = {
  start: "Start",
  progress: "Earlier and later",
  iterate: "Submissions",
  recovery: "After a failed submission",
  confidence: "How sure",
  difficulty: "By difficulty",
  languages: "Languages",
  familiarity: "Usual languages",
  typing: "Typing",
  repeat: "Coming back",
};
export interface Question {
  id: QuestionId;
  question: string;
  answer: string;
  /** A picture that adds to the answer (a shape across solves), or none when it would only repeat it. */
  visual: Visual | null;
  /** One supporting fact, when it adds to the answer. */
  detail: string | null;
  /** At most one short line a player needs to read the answer correctly. */
  note: string | null;
  /**
   * At most one tiny matched comparison on this answer. None in this version (ENG-374): of the
   * receipt fields, submissions differ by the example gate (a person passes the examples before
   * submitting, a model needn't) and final code length has no counterpart in the code-free
   * attempt summaries. A matched model nugget stays welcome when one is genuinely like for like.
   */
  fyi: string | null;
  /** The answer in a few words, when it is strong enough to lead the report. */
  takeaway: string | null;
}
export interface NextStep {
  label: string;
  href: string;
}
/** A question the report supports but can't answer from this player's practice yet. */
export interface Undiscovered {
  id: QuestionId | "basics";
  question: string;
  /** What practice would let it be answered: the real requirement, never an arbitrary count. */
  need: string;
  /** One specific step that provides it, when one exists. */
  action: NextStep | null;
}
/** Model results as the data hook reads them; the report itself shows none (see `Question.fyi`). */
export type ReceiptState = ModelReceipt[] | "loading" | "unavailable";
export interface ReportInput {
  catalog: readonly ChallengeSummary[];
  progress: Progress;
  attempts: readonly ReportAttempt[];
  profile: Profile | null;
}
export interface Report {
  /** Nothing started on this device or in uploaded history. */
  empty: boolean;
  /**
   * One or two solves: a first receipt, its answers as short labelled lines with no pictures,
   * rather than a portrait of chapters. Null once there are three or more solves.
   */
  firstSolves: string | null;
  /** A few lines that lead the report, each pointing at the answer it summarizes. */
  takeaways: { id: QuestionId; text: string }[];
  questions: Question[];
  /** A short line when something was started but no question can be answered yet. */
  waiting: string | null;
  next: NextStep | null;
  /** Supported questions not answerable yet, for the bottom of the report. */
  discover: Undiscovered[];
  /** Why each comparison isn't shown yet, with what it waits on: policy and method, not missing practice. */
  discoverNote: string | null;
  profile: NextStep | null;
  /**
   * Show the optional languages invitation under the languages answer: only while the person
   * hasn't answered it themselves (a quick-start guess doesn't count). It unlocks nothing; an
   * answer only groups their own practice into usual and other languages.
   */
  languagesInvite: boolean;
  /** The few counts a player may choose to share (see `shareText`); null before any solve. */
  share: ShareSummary | null;
}

/**
 * What the share preview offers, and nothing else: counts of solved challenges, by catalog
 * language, and how many first submissions passed. No challenge names, times, dates, code,
 * profile or after-solve answers, and nothing that identifies the player or an attempt.
 */
export interface ShareSummary {
  solved: number;
  /** Every solved challenge by catalog language, or empty when some language isn't known. */
  languages: { label: string; solved: number }[];
  firstPassed: { passed: number; of: number } | null;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const count = (n: number) => WORDS[n] ?? `${n}`;
const and = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const median = (values: number[]) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b),
    i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
/** Minutes or seconds, rounded for reading, never more precise than the evidence. */
export function duration(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} s`;
  const minutes = Math.round(ms / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
const clean = (a: AttemptSummary) => !a.issues.length;
const num = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v);
const when = (a: AttemptSummary) => a.started ?? a.last;
const chronological = <T extends AttemptSummary>(list: readonly T[]) =>
  [...list].sort((x, y) => when(x).localeCompare(when(y)) || x.attempt.localeCompare(y.attempt));
/** Active editing time, explained once on the first answer that uses it. */
const ACTIVE_NOTE = "Active editing counts time typing, editing or selecting in the editor; pauses over 30 s are left out.";

const SUBMITTED = /^(passed|failed|errored|cancelled): (\d+)\/(\d+) checks; (\d+) static rules$/;
export function submissions(a: AttemptSummary) {
  return a.timeline.flatMap((t) => {
    const m = SUBMITTED.exec(t.label);
    return m ? [{ result: m[1], passed: +m[2], total: +m[3], rules: +m[4], at: t.at }] : [];
  });
}
/** The observed window, named at every sample size: "In your one solve", "Across your four solves". */
const across = (n: number, what = "solve") => (n === 1 ? `In your one ${what}` : `Across your ${count(n)} ${what}s`);

/**
 * What a solve took, in recorded order up to the first fully passing submission: submissions,
 * example runs that ran your code, and runs that failed on the service's side. Cancelled
 * submissions (counted apart) and submissions whose run failed on the service's side never ran
 * your code, so they aren't submissions here. Unknown when the attempt isn't solved, or when its checkpoint list was cut to the latest
 * 200 and could be missing earlier checks.
 */
export function toSolve(
  a: AttemptSummary,
): {
  submissions: number;
  cancelled: number;
  exampleRuns: number;
  serviceFailures: number;
  /** What happened to the first recorded submission when it doesn't count: cancelled, or failed on our side. */
  firstVoided: "cancelled" | "service" | null;
  /** Each counted submission in order, true for the one that solved it (always the last). */
  marks: boolean[];
} | null {
  if (!a.completed || a.timeline.length >= TIMELINE_CAP) return null;
  let count = 0,
    cancelled = 0,
    exampleRuns = 0,
    serviceFailures = 0,
    skip = false,
    seen = false,
    firstVoided: "cancelled" | "service" | null = null;
  const marks: boolean[] = [];
  for (const t of a.timeline) {
    if (t.label === "examples: result" || t.label === "examples: user-error") exampleRuns++;
    if (t.label.endsWith(": runner-error")) {
      serviceFailures++;
      // A failed submit run is followed by its "errored" verdict: not the person's submission.
      if (t.label.startsWith("submit: ")) skip = true;
    }
    const m = SUBMITTED.exec(t.label);
    if (!m) continue;
    if (skip || m[1] === "cancelled") {
      if (!seen) firstVoided = skip ? "service" : "cancelled";
      seen = true;
      if (!skip) cancelled++;
      skip = false;
      continue;
    }
    seen = true;
    count++;
    const solved = m[1] === "passed" && +m[2] === +m[3] && +m[4] === 0;
    marks.push(solved);
    if (solved) return { submissions: count, cancelled, exampleRuns, serviceFailures, firstVoided, marks };
  }
  return null;
}

/**
 * Catalog metadata for an attempt only when it ran the challenge's current revision: an older
 * revision may have had a different difficulty or language, so it is left out rather than guessed.
 */
function current<T>(catalog: readonly ChallengeSummary[], pick: (c: ChallengeSummary) => T) {
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  return (a: AttemptSummary): T | undefined => {
    const c = byKey.get(a.challenge);
    return c && c.revision === a.revision ? pick(c) : undefined;
  };
}
const activeToSolve = (a: AttemptSummary) => (num(a.values.activeToSolve) && a.values.activeToSolve > 0 ? a.values.activeToSolve : null);

/**
 * Time to the first edit (one page session's clock, so it includes reading, thinking or being
 * away, and is never called any of them), then active editing up to the solve. Two clocks, so two
 * numbers, never one split.
 */
function start(solved: ReportAttempt[]): Question | null {
  // One population for both numbers: solves with a first edit in the starting visit and active
  // editing to the solve. Without any, the first edit alone, from its own solves.
  const both = solved.filter((a) => num(a.values.firstEdit) && activeToSolve(a));
  const pool = both.length ? both : solved.filter((a) => num(a.values.firstEdit));
  if (!pool.length) return null;
  const n = pool.length;
  const about = n > 1 ? "about " : "";
  const first = duration(median(pool.map((a) => a.values.firstEdit!))!);
  const then = both.length ? `, then ${about}${duration(median(both.map((a) => activeToSolve(a)!))!)} of active editing to the solve` : "";
  return {
    id: "start",
    question: QUESTIONS.start,
    answer: n === 1 ? `Your first edit came ${first} in${then}.` : `${across(n)}, your first edit came ${about}${first} in${then}.`,
    visual: null,
    detail: null,
    note: null,
    fyi: null,
    takeaway: null,
  };
}

/**
 * Earlier and later solves of different challenges at one language and labelled difficulty, with
 * the same editor and runtime conditions: active editing to each solve, set side by side. First
 * solves only (a repeat or a solve started "again" is the repeat answer). Different challenges
 * can differ in size, so this describes these solves and never claims a skill change or leads.
 */
function progress(solved: ReportAttempt[], catalog: readonly ChallengeSummary[]): Question | null {
  const level = current(catalog, (c) => `${c.difficulty} ${languageLabel(c.language)}`);
  const groups = new Map<string, { label: string; solves: ReportAttempt[] }>();
  const seen = new Set<string>();
  for (const a of chronological(solved)) {
    const label = level(a);
    if (!label || !activeToSolve(a) || a.practice === "repeat" || seen.has(a.challenge)) continue;
    seen.add(a.challenge);
    const key = JSON.stringify([label, [...a.conditions].sort()]);
    const g = groups.get(key) ?? { label, solves: [] };
    g.solves.push(a);
    groups.set(key, g);
  }
  const best = [...groups.values()].sort((x, y) => y.solves.length - x.solves.length)[0];
  if (!best || best.solves.length < 2) return null;
  const { label, solves: group } = best;
  const times = group.map((a) => activeToSolve(a)!);
  const n = times.length,
    half = Math.floor(n / 2);
  const [before, after] = n >= 4 ? [median(times.slice(0, half))!, median(times.slice(n - half))!] : [times[0], times[n - 1]];
  const change = after <= before * FASTER ? "less" : after >= before * SLOWER ? "more" : "similar";
  const scope = `${across(n, `${label} challenge`)}`;
  const answer =
    n < 4
      ? `${scope}, the first took ${duration(before)} of active editing and the latest ${duration(after)}.`
      : change === "similar"
        ? `${scope}, the earlier ${half} and the later ${half} took a similar ${duration(after)} of active editing each, typically.`
        : `${scope}, the earlier ${half} took about ${duration(before)} of active editing each and the later ${half} about ${duration(after)}.`;
  return {
    id: "progress",
    question: QUESTIONS.progress,
    answer,
    // Each solve in order, the oldest first, at most the latest eight.
    visual: { kind: "bars", bars: group.slice(-8).map((a) => ({ label: a.challenge, value: activeToSolve(a)!, display: duration(activeToSolve(a)!) })) },
    detail: null,
    note: "Different challenges at the same labelled difficulty, in the same editor setup. They can differ in size, so this describes these solves, not a change in skill.",
    fyi: null,
    takeaway: null,
  };
}

const SUBMISSION_BUCKETS: [string, number, number][] = [
  ["1", 1, 1],
  ["2", 2, 2],
  ["3–4", 3, 4],
  ["5+", 5, Infinity],
];
/**
 * Submissions up to each solve that ran your code, and whether the first recorded submission
 * passed. That claim comes from `firstSubmit`, which judges the very first submission in order and
 * is unknown when it was cancelled or failed on our side: a later pass is never called a first.
 */
function iterate(solved: ReportAttempt[]): Question | null {
  // Up to the solve: anything after it doesn't make a solve iterative.
  const rows = chronological(solved).flatMap((a) => {
    const s = toSolve(a);
    return s ? [{ ...s, first: a.values.firstSubmit, challenge: a.challenge }] : [];
  });
  if (!rows.length) return null;
  const n = rows.length;
  const subs = rows.map((s) => s.submissions);
  const known = rows.filter((s) => s.first === 0 || s.first === 1);
  const passedFirst = known.filter((s) => s.first === 1).length;
  const m = median(subs)!;
  const only = rows[0];
  const answer =
    n === 1
      ? only.first === 1
        ? "Your solve passed on its first submission."
        : only.first === 0
          ? `Your solve took ${plural(only.submissions, "submission")}; the first didn't pass.`
          : only.firstVoided
            ? `Your solve took ${plural(only.submissions, "submission")}, after an earlier one ${only.firstVoided === "cancelled" ? "was cancelled" : "failed on our side"}.`
            : `Your solve took ${plural(only.submissions, "submission")}; the first one's result isn't known.`
      : known.length === n
        ? passedFirst === n
          ? `${across(n)}, every first submission passed.`
          : `${across(n)}, ${howMany(passedFirst)} passed on the first submission; a typical one took ${plural(m, "submission")}.`
        : `${across(n)}, ${passedFirst} of ${known.length} first ${known.length === 1 ? "submission" : "submissions"} with a known result passed; a typical solve took ${plural(m, "submission")}.`;
  const buckets = SUBMISSION_BUCKETS.flatMap(([label, low, high]) => {
    const k = subs.filter((c) => c >= low && c <= high).length;
    return k ? [{ label: `${label} ${low === 1 && high === 1 ? "submission" : "submissions"}`, value: k, display: plural(k, "solve") }] : [];
  });
  const runs = median(rows.map((s) => s.exampleRuns))!;
  const failures = rows.reduce((t, s) => t + s.serviceFailures, 0);
  const cancelled = rows.reduce((t, s) => t + s.cancelled, 0);
  // Practice asks for passing examples before a submission, so a run is expected; how many is yours.
  const examples = !runs
    ? ""
    : n === 1
      ? `You ran the examples ${runs === 1 ? "once" : `${runs} times`} before the solve.`
      : `You ran the examples about ${plural(runs, "time")} per solve.`;
  const uncounted = [
    failures ? `${plural(failures, "run")} failed on our side` : "",
    cancelled ? `${plural(cancelled, "submission")} ${cancelled === 1 ? "was" : "were"} cancelled` : "",
  ].filter(Boolean);
  return {
    id: "iterate",
    question: QUESTIONS.iterate,
    answer,
    // One or two solves: each one's submissions in order, when one took more than one. From
    // three, how many solves took 1, 2, 3–4 or 5+: a shape, shown only when there is one.
    visual:
      n <= 2
        ? rows.some((s) => s.submissions > 1)
          ? {
              kind: "dots",
              legend: ["passed", "didn't pass"],
              rows: rows.map((s) => ({ label: s.challenge, marks: s.marks, display: plural(s.submissions, "submission") })),
            }
          : null
        : buckets.length > 1
          ? { kind: "bars", bars: buckets }
          : null,
    detail: [examples, uncounted.length ? `${uncounted.join(" and ")}; they aren't counted.` : ""].filter(Boolean).join(" ") || null,
    note: null,
    fyi: null,
    takeaway: known.length ? `First submission passed in ${passedFirst} of ${plural(known.length, "solve")}` : null,
  };
}

/**
 * After a failed submission (failed checks, fired rules or code that didn't compile or run): how
 * long until a better submission (wall time, so it includes thinking and runner waits) and how
 * many checks that took, the better one included (`recoveryChecks`). Not time to the solve. How
 * often a first submission failed is the iterate answer's, so it isn't repeated here.
 */
function recovery(solved: ReportAttempt[]): Question | null {
  const recovered = solved.filter((a) => num(a.values.recoveryTime) && a.values.recoveryTime >= 0);
  if (!recovered.length) return null;
  const n = recovered.length;
  const t = duration(median(recovered.map((a) => a.values.recoveryTime!))!);
  const c = median(recovered.map((a) => a.values.recoveryChecks).filter(num));
  const checks = c === null || c < 1 ? "" : c === 1 ? ", on the next check" : `, within ${c} checks`;
  const answer =
    n === 1
      ? `After the failed submission, a better one came ${t} later${checks}.`
      : `${across(n, "solve")} with a failed submission, a better one came about ${t} later${checks}${n > 2 ? ", typically" : ""}.`;
  return {
    id: "recovery",
    question: QUESTIONS.recovery,
    answer,
    visual: null,
    detail: null,
    note: null,
    fyi: null,
    takeaway: `A better submission about ${t} after a failed one (${plural(n, "solve")})`,
  };
}

const howMany = (n: number) => (n ? `${n}` : "none");
const CONFIDENCE: [string, string][] = [
  ["sure", "sure"],
  ["fairly", "fairly sure"],
  ["unsure", "unsure"],
  ["guessing", "guessing"],
];
/**
 * Your answer after a solve ("how sure were you it would pass?") beside whether the first
 * submission did. Asked after the result, so it is a recollection that the result may colour,
 * never a calibration or a prediction.
 */
function confidence(solved: ReportAttempt[]): Question | null {
  const rows = solved.filter((a) => a.answers.confidence && num(a.values.firstSubmit));
  if (rows.length < 2) return null;
  const tally = (levels: string[]) => {
    const r = rows.filter((a) => levels.includes(a.answers.confidence));
    return { n: r.length, passed: r.filter((a) => a.values.firstSubmit === 1).length };
  };
  const sure = tally(["sure", "fairly"]),
    unsure = tally(["unsure", "guessing"]);
  const of = (t: { n: number; passed: number }) => `${t.passed} of ${t.n}`;
  const scope = across(rows.length, "answered solve");
  const answer =
    sure.n && unsure.n
      ? `${scope}, the first submission passed in ${sure.passed} of ${plural(sure.n, "solve")} you felt sure about, and ${unsure.passed} of ${unsure.n} you felt unsure about.`
      : sure.n
        ? `${scope}, you said you were sure; the first submission passed in ${howMany(sure.passed)} of them.`
        : `${scope}, you said you were unsure; the first submission passed in ${howMany(unsure.passed)} of them.`;
  return {
    id: "confidence",
    question: QUESTIONS.confidence,
    answer,
    // Each answered solve as a mark under what you said: filled when its first submission passed.
    visual: {
      kind: "dots",
      legend: ["first passed", "first didn't pass"],
      rows: CONFIDENCE.flatMap(([value, label]) => {
        const r = chronological(rows.filter((a) => a.answers.confidence === value));
        const t = tally([value]);
        return r.length ? [{ label, marks: r.map((a) => a.values.firstSubmit === 1), display: `${of(t)} passed first` }] : [];
      }),
    },
    detail: null,
    note: "You answered after the result, so it may colour the answer.",
    fyi: null,
    // Leads only when sure and unsure went differently; otherwise there is nothing to sum up.
    takeaway:
      sure.n && unsure.n && sure.passed / sure.n !== unsure.passed / unsure.n
        ? `Said sure: ${of(sure)} first submissions passed; unsure: ${of(unsure)}`
        : null,
  };
}

/**
 * Active editing up to the solve by labelled difficulty, with how many solves each level has.
 * Needs two levels: one level alone would only repeat the start answer's active editing.
 */
function difficulty(solved: ReportAttempt[], catalog: readonly ChallengeSummary[]): Question | null {
  const level = current(catalog, (c) => c.difficulty);
  const groups = ["easy", "medium", "hard"]
    .map((d) => ({ d, times: solved.filter((a) => level(a) === d && activeToSolve(a)).map((a) => activeToSolve(a)!) }))
    .filter((g) => g.times.length);
  if (groups.length < 2) return null;
  const bars = groups.map((g) => {
    const m = median(g.times)!;
    return { label: g.d, value: m, display: `${duration(m)} · ${plural(g.times.length, "solve")}` };
  });
  const total = groups.reduce((t, g) => t + g.times.length, 0);
  return {
    id: "difficulty",
    question: QUESTIONS.difficulty,
    answer: `${across(total)}, ${groups.some((g) => g.times.length > 1) ? "typical " : ""}active editing to the solve: ${groups.map((g) => `${g.d} ${duration(median(g.times)!)}`).join(", ")}.`,
    visual: { kind: "bars", bars },
    detail: null,
    note: null,
    fyi: null,
    takeaway: null,
  };
}

/** Challenges solved and in progress per catalog language (current revisions, clean traces), most solved first. */
function languageWork(attempts: readonly ReportAttempt[], catalog: readonly ChallengeSummary[]) {
  const lang = current(catalog, (c) => c.language);
  const work = new Map<string, { solved: Set<string>; tried: Set<string> }>();
  for (const a of attempts) {
    const l = lang(a);
    if (!l || !clean(a)) continue;
    const w = work.get(l) ?? { solved: new Set<string>(), tried: new Set<string>() };
    w.tried.add(a.challenge);
    if (a.completed) w.solved.add(a.challenge);
    work.set(l, w);
  }
  return [...work]
    .map(([l, w]) => ({ label: languageLabel(l), solved: w.solved.size, open: w.tried.size - w.solved.size }))
    .sort((x, y) => y.solved - x.solved || y.open - x.open || x.label.localeCompare(y.label));
}
/** A ring stays readable up to this many slices; the rest are one "other languages" slice. */
export const SLICES = 5;

/** Languages by challenges solved and still in progress, never by an unexplained duration. */
function languages(attempts: readonly ReportAttempt[], catalog: readonly ChallengeSummary[]): Question | null {
  const rows = languageWork(attempts, catalog);
  if (!rows.length) return null;
  const parts = rows.map((r) => ({
    label: r.label,
    value: r.solved + r.open,
    display: [r.solved && `${r.solved} solved`, r.open && `${r.open} in progress`].filter(Boolean).join(" · "),
  }));
  if (parts.length > SLICES) {
    const rest = rows.slice(SLICES - 1);
    const solvedRest = rest.reduce((t, r) => t + r.solved, 0),
      openRest = rest.reduce((t, r) => t + r.open, 0);
    parts.splice(SLICES - 1, Infinity, {
      label: `${rest.length} other languages`,
      value: solvedRest + openRest,
      display: [solvedRest && `${solvedRest} solved`, openRest && `${openRest} in progress`].filter(Boolean).join(" · "),
    });
  }
  return {
    id: "languages",
    question: QUESTIONS.languages,
    answer:
      rows.length === 1
        ? rows[0].solved
          ? `All ${rows[0].label} so far: ${plural(rows[0].solved, "challenge")} solved${rows[0].open ? `, ${rows[0].open} in progress` : ""}.`
          : `All ${rows[0].label} so far, nothing solved yet.`
        : rows.every((r) => r.solved === rows[0].solved)
          ? `${and(rows.map((r) => r.label))} so far, ${rows[0].solved} solved in each.`
          : `${across(rows.reduce((t, r) => t + r.solved, 0), "solved challenge")}: ${rows.map((r) => `${r.label} ${r.solved}`).join(", ")}.`,
    // Each challenge has one language, so they split the whole. One language is said in the
    // answer; a ring only when there are languages to share it.
    visual: rows.length > 1 ? { kind: "pie", whole: "Challenges worked on, by language", parts } : null,
    detail: null,
    note: null,
    fyi: null,
    takeaway: null,
  };
}

/** A profile groups existing personal work; it makes no claim about other players. */
function familiarity(
  attempts: readonly ReportAttempt[],
  catalog: readonly ChallengeSummary[],
  profile: Profile | null,
): Question | null {
  if (!profile?.languages?.length) return null;
  const lang = current(catalog, (c) => c.language);
  const work = [new Set<string>(), new Set<string>()];
  for (const a of attempts) {
    const language = lang(a);
    if (!language || !clean(a)) continue;
    work[profile.languages.includes(language as (typeof profile.languages)[number]) ? 0 : 1].add(a.challenge);
  }
  const [usual, other] = work.map((w) => w.size);
  if (!usual && !other) return null;
  return {
    id: "familiarity",
    question: QUESTIONS.familiarity,
    answer: !other
      ? "All your recorded practice is in your usual languages so far."
      : !usual
        ? "Your recorded practice is outside your usual languages so far."
        : `${plural(usual, "challenge")} in your usual languages; ${other} outside them.`,
    // Inside or outside your languages, never both: one bar split in two, when both have some.
    visual:
      usual && other
        ? {
            kind: "split",
            whole: "Challenges worked on, inside and outside your usual languages",
            parts: [
              { label: "Usual languages", value: usual, display: plural(usual, "challenge") },
              { label: "Other languages", value: other, display: plural(other, "challenge") },
            ],
          }
        : null,
    detail: null,
    note: "Challenges you worked on, grouped by the languages you listed.",
    fyi: null,
    takeaway: null,
  };
}

/**
 * Words per minute while typing code characters: all code-character keystroke intervals inside
 * bursts, pooled (keys over time), at 5 characters a word. Arrows, Backspace, shortcuts, pastes
 * and pauses over 2 s aren't counted.
 */
function typing(attempts: readonly ReportAttempt[]): Question | null {
  const usable = attempts.filter((a) => clean(a) && num(a.values.typedKeys) && num(a.values.typingTime));
  const keys = usable.reduce((n, a) => n + a.values.typedKeys!, 0),
    ms = usable.reduce((n, a) => n + a.values.typingTime!, 0);
  if (keys < MIN_TYPED_KEYS || ms <= 0) return null;
  const wpm = Math.round((keys / ms) * 60_000 / KEYS_PER_WORD);
  return {
    id: "typing",
    question: QUESTIONS.typing,
    answer: `About ${wpm} words a minute while you're typing code.`,
    visual: { kind: "number", value: `${wpm}`, unit: "wpm" },
    detail: null,
    note: "Pastes, arrows, deletions and pauses don't count.",
    fyi: null,
    takeaway: null,
  };
}

/**
 * Solving the same challenge again (same version and conditions): submissions to the first solve
 * and to the latest, whichever way it went. Fewer, the same and more are all shown; familiarity
 * with that challenge helps, so it is never a claim about skill. The most recently repeated one.
 */
function repeat(solved: ReportAttempt[]): Question | null {
  const groups = new Map<string, ReportAttempt[]>();
  for (const a of solved.filter(clean)) {
    const key = JSON.stringify([a.challenge, a.revision, [...a.conditions].sort()]);
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  // Submissions up to each solve; any checks after a solve aren't "needed".
  const s = [...groups.values()]
    .map((group) => chronological(group.filter((a) => toSolve(a))))
    .filter((g) => g.length >= 2)
    .sort((x, y) => when(y.at(-1)!).localeCompare(when(x.at(-1)!)))[0];
  if (!s) return null;
  const before = toSolve(s[0])!.submissions,
    after = toSolve(s.at(-1)!)!.submissions,
    key = s[0].challenge;
  const scope = s.length === 2 ? `Back on ${key}` : `Across your ${count(s.length)} solves of ${key}`;
  return {
    id: "repeat",
    question: QUESTIONS.repeat,
    answer:
      after === before
        ? `${scope}, the latest took ${plural(after, "submission")}, the same as the first.`
        : `${scope}, the latest took ${plural(after, "submission")}; the first took ${before}.`,
    visual: null,
    detail: null,
    note: "Same challenge, so familiarity with it plays a part.",
    fyi: null,
    takeaway: null,
  };
}

/**
 * Where to go next: an unfinished attempt first; otherwise what practice would offer after your
 * latest solve (same language, then your languages, then nearby difficulty).
 */
function next(input: ReportInput, started: Set<string>, solved: ReportAttempt[]): NextStep | null {
  const { catalog, progress } = input;
  const open = catalog.find((c) => progress[c.key] && !progress[c.key].completedAt && c.runnable);
  if (open) return { label: `Resume ${open.key} · ${open.title}`, href: `/challenges/${open.key}` };
  if (!started.size) return { label: "Pick a language and start", href: "/start" };
  const completed = new Set([...Object.keys(progress).filter((k) => progress[k].completedAt), ...solved.map((a) => a.challenge)]);
  // The most recent thing worked on anchors the suggestion, as finishing it in practice would.
  const recent = [
    ...Object.entries(progress).map(([key, p]) => ({ key, at: p.completedAt ?? p.startedAt })),
    ...input.attempts.map((a) => ({ key: a.challenge, at: a.last })),
  ]
    .filter((r) => r.at && started.has(r.key))
    .sort((x, y) => y.at!.localeCompare(x.at!) || x.key.localeCompare(y.key))[0];
  const anchor = recent && catalog.find((c) => c.key === recent.key);
  const pick = anchor
    ? nextProblem(anchor, catalog, completed, input.profile?.languages ?? [])
    : catalog.find((c) => c.runnable && !completed.has(c.key));
  return pick && pick.runnable && !started.has(pick.key) ? { label: `Next: ${pick.key} · ${pick.title}`, href: `/challenges/${pick.key}` } : null;
}

/**
 * The rest of the portrait: each supported question not answered yet, what would answer it and,
 * where one exists, one step that does. Only real requirements: no unlock counts, nothing the
 * report can't compute. Familiarity isn't listed: the languages invitation already offers it,
 * and a hidden invitation stays hidden.
 */
function toDiscover(input: ReportInput, solved: ReportAttempt[], answered: Set<string>): Undiscovered[] {
  const out: Undiscovered[] = [];
  const add = (id: QuestionId, need: string, action: NextStep | null = null) => {
    if (!answered.has(id)) out.push({ id, question: QUESTIONS[id], need, action });
  };
  const byKey = new Map(input.catalog.map((c) => [c.key, c]));
  const completed = new Set([...Object.keys(input.progress).filter((k) => input.progress[k].completedAt), ...solved.map((a) => a.challenge)]);
  const ordered = chronological(solved);
  const onCurrent = (a: AttemptSummary) => byKey.get(a.challenge)?.revision === a.revision;
  const link = (c: ChallengeSummary | null | undefined, prefix = "") =>
    c?.runnable ? { label: `${prefix}${c.key} · ${c.title}`, href: `/challenges/${c.key}` } : null;
  const basics = (["start", "iterate", "languages"] as const).filter((id) => !answered.has(id));
  if (!ordered.length) {
    // One solve answers these together, so they're one line; only those not answered already.
    const names = { start: "how soon you start", iterate: "how you iterate", languages: "your languages" };
    if (basics.length)
      out.push({
        id: "basics",
        question: and(basics.map((id) => names[id])).replace(/^./, (c) => c.toUpperCase()),
        need: "Your first solve answers these.",
        action: null,
      });
  } else for (const id of basics) add(id, "Shows for a solve recorded from its start to the solve on this challenge's current version.");
  // The latest solve on a current version anchors the comparisons below.
  const latest = ordered.filter(onCurrent).at(-1);
  const level = latest ? byKey.get(latest.challenge) : undefined;
  const pick = (keep: (c: ChallengeSummary) => boolean) =>
    level ? nextProblem(level, input.catalog.filter((c) => c.language === level.language && keep(c)), completed, input.profile?.languages ?? []) : null;
  const otherLevel = pick((c) => c.difficulty !== level!.difficulty);
  add(
    "difficulty",
    level && otherLevel
      ? `Solve a ${otherLevel.difficulty} challenge to set beside your ${level.difficulty} ones.`
      : "Shows once you've solved challenges at two difficulty levels.",
    link(otherLevel),
  );
  const alike = pick((c) => c.difficulty === level!.difficulty);
  add(
    "progress",
    level && alike
      ? `Solve another ${level.difficulty} ${languageLabel(level.language)} challenge to set beside your earlier ones.`
      : "Solve two different challenges in one language at the same difficulty to set them side by side.",
    link(alike),
  );
  add("recovery", "Shows once a submission doesn't pass and a better one follows before you solve the challenge.");
  const answeredConfidence = solved.filter((a) => a.answers.confidence && num(a.values.firstSubmit)).length;
  add(
    "confidence",
    `Shows after ${answeredConfidence ? "one more answer" : "two answers"} to "how sure were you?", an optional question offered now and then after a solve.`,
  );
  // Clean attempts whose typing is null had Vim keybindings on: their letters can be commands.
  const cleanAttempts = input.attempts.filter(clean);
  const vim = cleanAttempts.length > 0 && cleanAttempts.every((a) => a.values.typedKeys === null);
  add(
    "typing",
    vim
      ? "Not measured while Vim keybindings are on, since their letters can be commands."
      : `Shows after about ${MIN_TYPED_KEYS} characters of code typed by hand; pastes and shortcuts don't count.`,
  );
  // A repeat compares solves of one version, so the baseline must be on the version played now.
  const baseline = ordered.find(onCurrent);
  add(
    "repeat",
    baseline
      ? "Solve a challenge again in the same setup; this sets its submissions beside your first solve."
      : "Solve a challenge, then solve it again later in the same setup.",
    link(baseline && byKey.get(baseline.challenge), "Again: "),
  );
  return out;
}

/** The share preview's counts; null before any solve. */
function shareSummary(input: ReportInput, solved: ReportAttempt[]): ShareSummary | null {
  const total = new Set(solved.map((a) => a.challenge)).size;
  if (!total) return null;
  // By language only when every solved challenge has one (an older revision's isn't guessed).
  const rows = languageWork(input.attempts, input.catalog).filter((r) => r.solved);
  // The iterate answer's population: solves up to the solve, first result known.
  const known = chronological(solved)
    .filter((a) => toSolve(a) && (a.values.firstSubmit === 0 || a.values.firstSubmit === 1))
    .map((a) => a.values.firstSubmit === 1);
  return {
    solved: total,
    languages: rows.reduce((t, r) => t + r.solved, 0) === total ? rows.map((r) => ({ label: r.label, solved: r.solved })) : [],
    firstPassed: known.length ? { passed: known.filter(Boolean).length, of: known.length } : null,
  };
}

/** Text-sized bar for a plain-text summary: at most this many blocks for the largest count. */
const SHARE_BAR = 10;
/**
 * The summary exactly as the preview shows it and as it is copied, shared or downloaded: the
 * counts in `ShareSummary`, a link to the site, nothing else.
 */
export function shareText(s: ShareSummary, site: string): string {
  const lines = ["My unaided coding practice on Muscle Memory", ""];
  if (s.languages.length === 1) lines.push(`${plural(s.solved, `${s.languages[0].label} challenge`)} solved`);
  else if (!s.languages.length) lines.push(`${plural(s.solved, "challenge")} solved`);
  else {
    lines.push(`${plural(s.solved, "challenge")} solved`);
    const most = Math.max(...s.languages.map((l) => l.solved));
    const width = Math.max(...s.languages.map((l) => l.label.length));
    for (const l of s.languages)
      lines.push(`  ${l.label.padEnd(width)}  ${"■".repeat(Math.max(1, Math.round((l.solved / most) * SHARE_BAR)))} ${l.solved}`);
  }
  if (s.firstPassed)
    lines.push(
      s.firstPassed.of === 1
        ? `First submission ${s.firstPassed.passed ? "passed" : "didn't pass"}`
        : `First submission passed in ${s.firstPassed.passed} of ${s.firstPassed.of} solves`,
    );
  lines.push("", `Keep your coding skills in practice: ${site}`);
  return lines.join("\n");
}

export function buildReport(input: ReportInput): Report {
  const known = new Set(input.catalog.map((c) => c.key));
  const started = new Set([...Object.keys(input.progress), ...input.attempts.map((a) => a.challenge)].filter((k) => known.has(k)));
  const solved = input.attempts.filter((a) => a.completed && clean(a) && known.has(a.challenge));
  const questions = [
    start(solved),
    iterate(solved),
    recovery(solved),
    confidence(solved),
    difficulty(solved, input.catalog),
    progress(solved, input.catalog),
    languages(input.attempts, input.catalog),
    familiarity(input.attempts, input.catalog, input.profile),
    // Per-keystroke change sizes do not establish a person's revision style.
    typing(input.attempts),
    repeat(solved),
  ].filter((q): q is Question => q !== null);
  const active = questions.find((q) => /active editing/.test(q.answer));
  if (active) active.note = active.note ? `${active.note} ${ACTIVE_NOTE}` : ACTIVE_NOTE;
  // The strongest answers lead, in this order; one solve has nothing to sum up yet.
  const lead: QuestionId[] = ["recovery", "confidence", "iterate"];
  // One or two solves are a first receipt: their answers are short enough to read whole.
  const takeaways = solved.length < 3 ? [] : lead.flatMap((id) => {
    const q = questions.find((x) => x.id === id);
    return q?.takeaway ? [{ id, text: q.takeaway }] : [];
  }).slice(0, TAKEAWAYS);
  return {
    empty: !started.size,
    firstSolves: solved.length === 1 ? "Your first solve" : solved.length === 2 ? "Your first two solves" : null,
    takeaways,
    questions,
    waiting: started.size && !questions.length ? "Solve a challenge and your answers start here." : null,
    next: next(input, started, solved),
    discover: toDiscover(input, solved, new Set(questions.map((q) => q.id))),
    // Each comparison's actual missing prerequisite, not a blanket "not comparable"; replaced by a
    // single matched FYI on the relevant answer once one is eligible (ENG-376 provides it).
    discoverNote: "Not compared yet. Other players: comparing with them waits on privacy controls still under review, then on enough comparable players on the same challenge. AI models: their recorded submissions don't have to pass the examples first, as yours do, so the two aren't counted alike; a model comparison shows only for a measure recorded the same way on the same challenge version.",
    profile: null,
    languagesInvite:
      questions.some((q) => q.id === "languages") &&
      !input.profile?.languages?.length,
    share: shareSummary(input, solved),
  };
}
