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

export type Visual =
  | { kind: "bars"; bars: { label: string; value: number; display: string }[] }
  | { kind: "number"; value: string; unit: string }
  | { kind: "turn"; from: string; to: string };
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
export interface Question {
  id: QuestionId;
  question: string;
  answer: string;
  visual: Visual;
  /** One supporting fact, when it adds to the answer. */
  detail: string | null;
  /** At most one short line a player needs to read the answer correctly. */
  note: string | null;
  /**
   * At most one tiny matched comparison on this answer. None today: model receipts count only
   * submissions, and practice makes a person pass the examples before submitting while a model
   * may submit straight away, so neither checks nor submissions compare like for like.
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
  /** A few lines that lead the report, each pointing at the answer it summarizes. */
  takeaways: { id: QuestionId; text: string }[];
  questions: Question[];
  /** A short line when something was started but no question can be answered yet. */
  waiting: string | null;
  next: NextStep | null;
  /** Supported questions not answerable yet, for the bottom of the report. */
  discover: Undiscovered[];
  /** Why comparisons aren't shown: policy and method, not missing practice. */
  discoverNote: string | null;
  profile: NextStep | null;
  /**
   * Show the optional languages invitation under the languages answer: only while the person
   * hasn't answered it themselves (a quick-start guess doesn't count). It unlocks nothing; an
   * answer only groups their own practice into usual and other languages.
   */
  languagesInvite: boolean;
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
 * submissions and submissions whose run failed on the service's side aren't yours, so they aren't
 * counted. Unknown when the attempt isn't solved, or when its checkpoint list was cut to the latest
 * 200 and could be missing earlier checks.
 */
export function toSolve(a: AttemptSummary): { submissions: number; exampleRuns: number; serviceFailures: number } | null {
  if (!a.completed || a.timeline.length >= TIMELINE_CAP) return null;
  let count = 0,
    exampleRuns = 0,
    serviceFailures = 0,
    skip = false;
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
      skip = false;
      continue;
    }
    count++;
    if (m[1] === "passed" && +m[2] === +m[3] && +m[4] === 0) return { submissions: count, exampleRuns, serviceFailures };
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
  const firsts = solved.filter((a) => num(a.values.firstEdit)).map((a) => a.values.firstEdit!);
  if (!firsts.length) return null;
  const n = firsts.length;
  const first = duration(median(firsts)!);
  const builds = solved.map(activeToSolve).filter(num);
  const build = builds.length ? duration(median(builds)!) : null;
  const then = build ? `, then ${builds.length > 1 ? "about " : ""}${build} of active editing to the solve` : "";
  return {
    id: "start",
    question: QUESTIONS.start,
    answer: n === 1 ? `Your first edit came ${first} in${then}.` : `${across(n)}, your first edit came about ${first} in${then}.`,
    visual: build ? { kind: "turn", from: `${first} to first edit`, to: `${build} active editing to solve` } : { kind: "number", value: first, unit: "to your first edit" },
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
/** Submissions up to each solve, whether the first passed, and the example runs along the way. */
function iterate(solved: ReportAttempt[]): Question | null {
  // Up to the solve: anything after it doesn't make a solve iterative.
  const steps = chronological(solved).map(toSolve).filter((x): x is NonNullable<typeof x> => x !== null);
  if (!steps.length) return null;
  const n = steps.length;
  const subs = steps.map((s) => s.submissions);
  const oneShot = subs.filter((x) => x === 1).length;
  const m = median(subs)!;
  const answer =
    n === 1
      ? subs[0] === 1
        ? "Your solve passed on its first submission."
        : `Your solve took ${plural(subs[0], "submission")}; the first didn't pass.`
      : oneShot === n
        ? `${across(n)}, every first submission passed.`
        : `${across(n)}, ${howMany(oneShot)} passed on the first submission; a typical one took ${plural(m, "submission")}.`;
  const runs = median(steps.map((s) => s.exampleRuns))!;
  const failures = steps.reduce((t, s) => t + s.serviceFailures, 0);
  // Practice asks for passing examples before a submission, so a run is expected; how many is yours.
  const examples = !runs
    ? ""
    : n === 1
      ? `You ran the examples ${runs === 1 ? "once" : `${runs} times`} before the solve.`
      : `You ran the examples about ${plural(runs, "time")} per solve.`;
  return {
    id: "iterate",
    question: QUESTIONS.iterate,
    answer,
    // How many solves took 1, 2, 3–4 or 5+ submissions: a shape, not a list of every solve.
    visual: {
      kind: "bars",
      bars: SUBMISSION_BUCKETS.flatMap(([label, low, high]) => {
        const k = subs.filter((c) => c >= low && c <= high).length;
        return k ? [{ label: `${label} ${low === 1 && high === 1 ? "submission" : "submissions"}`, value: k, display: plural(k, "solve") }] : [];
      }),
    },
    detail: [examples, failures ? `${plural(failures, "run")} failed on our side and ${failures === 1 ? "isn't" : "aren't"} counted.` : ""].filter(Boolean).join(" ") || null,
    note: null,
    fyi: null,
    takeaway: n >= 2 ? answer : null,
  };
}

/**
 * After a failed submission (failed checks, fired rules or code that didn't compile or run): how
 * long until a better submission (wall time, so it includes thinking and runner waits) and how
 * many checks in between. Not time to the solve.
 */
function recovery(solved: ReportAttempt[]): Question | null {
  const firsts = solved.filter((a) => num(a.values.firstSubmit));
  const back = firsts.filter((a) => a.values.firstSubmit === 0).length;
  const recovered = solved.filter((a) => num(a.values.recoveryTime) && a.values.recoveryTime >= 0);
  if (!recovered.length && !back) return null;
  const detail = !back || firsts.length === 1
    ? null
    : back === firsts.length
      ? `${back === 2 ? "Both your solves" : `All ${back} solves`} came after a failed first submission.`
      : `${back} of your ${plural(firsts.length, "solve")} came after a failed first submission.`;
  if (!recovered.length)
    return {
      id: "recovery",
      question: QUESTIONS.recovery,
      answer: `You kept going: ${plural(back, "solve")} came after a failed first submission.`,
      visual: { kind: "turn", from: "first submission failed", to: `solved ${back}×` },
      detail: null,
      note: null,
      fyi: null,
      takeaway: null,
    };
  const n = recovered.length;
  const t = duration(median(recovered.map((a) => a.values.recoveryTime!))!);
  const c = median(recovered.map((a) => a.values.recoveryChecks).filter(num));
  const between = c === null ? "" : c === 0 ? ", on your very next submission" : `, after ${plural(c, "check")} in between`;
  const answer =
    n === 1
      ? `After the failed submission, a better one came ${t} later${between}.`
      : `${across(n, "solve")} with a failed submission, a better one came about ${t} later${between}${n > 2 ? ", typically" : ""}.`;
  return {
    id: "recovery",
    question: QUESTIONS.recovery,
    answer,
    visual: { kind: "turn", from: "failed submission", to: `better one ${t} later` },
    detail,
    note: null,
    fyi: null,
    takeaway: n >= 2 ? `${across(n, "solve")} with a failed submission, a better one came about ${t} later.` : null,
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
      ? `${scope}, the first submission passed ${of(sure)} times you said you were sure, and ${of(unsure)} times you said unsure.`
      : sure.n
        ? `${scope}, you said you were sure; the first submission passed in ${howMany(sure.passed)} of them.`
        : `${scope}, you said you were unsure; the first submission passed in ${howMany(unsure.passed)} of them.`;
  return {
    id: "confidence",
    question: QUESTIONS.confidence,
    answer,
    visual: {
      kind: "bars",
      bars: CONFIDENCE.flatMap(([value, label]) => {
        const t = tally([value]);
        return t.n ? [{ label, value: t.passed / t.n, display: `${of(t)} passed first` }] : [];
      }),
    },
    detail: null,
    note: "You answered after the result, so it may colour the answer.",
    fyi: null,
    // Leads only when sure and unsure went differently; otherwise there is nothing to sum up.
    takeaway: rows.length >= 3 && sure.n && unsure.n && sure.passed / sure.n !== unsure.passed / unsure.n ? answer : null,
  };
}

/** Active editing up to the solve by labelled difficulty, with how many solves each level has. */
function difficulty(solved: ReportAttempt[], catalog: readonly ChallengeSummary[]): Question | null {
  const level = current(catalog, (c) => c.difficulty);
  const groups = ["easy", "medium", "hard"]
    .map((d) => ({ d, times: solved.filter((a) => level(a) === d && activeToSolve(a)).map((a) => activeToSolve(a)!) }))
    .filter((g) => g.times.length);
  if (!groups.length) return null;
  const bars = groups.map((g) => {
    const m = median(g.times)!;
    return { label: g.d, value: m, display: `${duration(m)} · ${plural(g.times.length, "solve")}` };
  });
  const total = groups.reduce((t, g) => t + g.times.length, 0);
  return {
    id: "difficulty",
    question: QUESTIONS.difficulty,
    answer:
      total === 1
        ? `Your ${groups[0].d} solve took ${duration(groups[0].times[0])} of active editing.`
        : `${across(total)}, ${groups.some((g) => g.times.length > 1) ? "typical " : ""}active editing to the solve: ${groups.map((g) => `${g.d} ${duration(median(g.times)!)}`).join(", ")}.`,
    visual: { kind: "bars", bars },
    detail: null,
    note: null,
    fyi: null,
    takeaway: null,
  };
}

/** Languages by challenges solved and still in progress, never by an unexplained duration. */
function languages(attempts: readonly ReportAttempt[], catalog: readonly ChallengeSummary[]): Question | null {
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
  if (!work.size) return null;
  const rows = [...work]
    .map(([l, w]) => ({ label: languageLabel(l), solved: w.solved.size, open: w.tried.size - w.solved.size }))
    .sort((x, y) => y.solved - x.solved || y.open - x.open || x.label.localeCompare(y.label));
  return {
    id: "languages",
    question: QUESTIONS.languages,
    answer:
      rows.length === 1
        ? rows[0].solved
          ? `All ${rows[0].label} so far: ${plural(rows[0].solved, "challenge")} solved.`
          : `All ${rows[0].label} so far, nothing solved yet.`
        : rows.every((r) => r.solved === rows[0].solved)
          ? `${and(rows.map((r) => r.label))} so far, ${rows[0].solved} solved in each.`
          : `${across(rows.reduce((t, r) => t + r.solved, 0), "solved challenge")}: ${rows.map((r) => `${r.label} ${r.solved}`).join(", ")}.`,
    visual: {
      kind: "bars",
      bars: rows.map((r) => ({
        label: r.label,
        value: r.solved + r.open,
        display: [r.solved && `${r.solved} solved`, r.open && `${r.open} in progress`].filter(Boolean).join(" · "),
      })),
    },
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
    visual: {
      kind: "bars",
      bars: [
        ["Usual languages", usual],
        ["Other languages", other],
      ].flatMap(([label, n]) => (n ? [{ label: label as string, value: n as number, display: plural(n as number, "challenge") }] : [])),
    },
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
    visual: { kind: "turn", from: `first ${plural(before, "submission")}`, to: `latest ${plural(after, "submission")}` },
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
  if (!ordered.length)
    // One solve answers these together, so they're one line rather than four with the same need.
    out.push({
      id: "basics",
      question: "How soon you start, how you iterate, your time by difficulty and your languages",
      need: "Your first solve answers these.",
      action: null,
    });
  else
    for (const id of ["start", "iterate", "difficulty", "languages"] as const)
      add(id, "Shows for a solve recorded from its start to the solve on this challenge's current version.");
  // Pace compares different challenges at one language and level: offer one like the latest solve.
  const latest = ordered.at(-1);
  const level = latest && byKey.get(latest.challenge)?.revision === latest.revision ? byKey.get(latest.challenge) : undefined;
  const alike = level
    ? nextProblem(
        level,
        input.catalog.filter((c) => c.language === level.language && c.difficulty === level.difficulty),
        completed,
        input.profile?.languages ?? [],
      )
    : null;
  add(
    "progress",
    level && alike
      ? `Solve another ${level.difficulty} ${languageLabel(level.language)} challenge to set beside your earlier ones.`
      : "Solve two different challenges in one language at the same difficulty to set them side by side.",
    alike?.runnable ? { label: `${alike.key} · ${alike.title}`, href: `/challenges/${alike.key}` } : null,
  );
  add("recovery", "Shows once a submission doesn't pass and a later one does better.");
  const answeredConfidence = solved.filter((a) => a.answers.confidence && num(a.values.firstSubmit)).length;
  add(
    "confidence",
    `Answer the optional "how sure were you?" question after ${answeredConfidence ? "one more solve" : "two solves"}.`,
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
  const first = ordered[0] && byKey.get(ordered[0].challenge);
  add(
    "repeat",
    first ? "Solve a challenge again later; this sets its submissions beside your first solve." : "Solve a challenge, then solve it again later.",
    first?.runnable ? { label: `Again: ${first.key} · ${first.title}`, href: `/challenges/${first.key}` } : null,
  );
  return out;
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
  const takeaways = solved.length < 2 ? [] : lead.flatMap((id) => {
    const q = questions.find((x) => x.id === id);
    return q?.takeaway ? [{ id, text: q.takeaway }] : [];
  }).slice(0, TAKEAWAYS);
  return {
    empty: !started.size,
    takeaways,
    questions,
    waiting: started.size && !questions.length ? "Solve a challenge and your answers start here." : null,
    next: next(input, started, solved),
    discover: toDiscover(input, solved, new Set(questions.map((q) => q.id))),
    discoverNote: "Comparisons with other players and with AI models aren't shown: other players' practice stays private for now, and models don't submit under the same rules.",
    profile: null,
    languagesInvite:
      questions.some((q) => q.id === "languages") &&
      !input.profile?.languages?.length,
  };
}
