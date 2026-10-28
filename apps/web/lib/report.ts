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
/** Wording cut-offs, not norms: later solves this much faster or slower read as a change. */
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
  progress: "Has your pace changed?",
  iterate: "Do you iterate or go for one shot?",
  recovery: "What happens after a failed submission?",
  confidence: "Does your confidence match the result?",
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

/**
 * Checks and submissions up to the first fully passing submission, in recorded order: what a
 * solve took, not what came after it, and whether the examples ran before the first submission.
 * Unknown when the attempt isn't solved, or when its checkpoint list was cut to the latest 200
 * and could be missing earlier checks.
 */
export function toSolve(a: AttemptSummary): { checks: number; submissions: number; examplesFirst: boolean } | null {
  if (!a.completed || a.timeline.length >= TIMELINE_CAP) return null;
  let checks = 0,
    count = 0,
    examplesFirst = false;
  for (const t of a.timeline) {
    if (t.label.startsWith("examples: ")) {
      checks++;
      if (!count) examplesFirst = true;
    }
    const m = SUBMITTED.exec(t.label);
    if (!m) continue;
    checks++;
    count++;
    if (m[1] === "passed" && +m[2] === +m[3] && +m[4] === 0) return { checks, submissions: count, examplesFirst };
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
  const first = duration(median(firsts)!);
  const builds = solved.map(activeToSolve).filter(num);
  const build = builds.length ? duration(median(builds)!) : null;
  const then = build ? `, then ${firsts.length > 2 ? "about " : ""}${build} of active editing to the solve` : "";
  return {
    id: "start",
    question: QUESTIONS.start,
    answer:
      firsts.length === 1
        ? `Your first edit came ${first} in${then}.`
        : firsts.length === 2
          ? `Across your two solves, your first edit came about ${first} in${then}.`
          : `Your first edit comes about ${first} in${then}.`,
    visual: build ? { kind: "turn", from: `${first} to first edit`, to: `${build} active editing to solve` } : { kind: "number", value: first, unit: "to your first edit" },
    detail: null,
    note: null,
    fyi: null,
    takeaway: null,
  };
}

/**
 * Later solves of different challenges at the same language and difficulty: did active editing to
 * the solve change? Each challenge counts once (its first solve); coming back to the same one is
 * the repeat answer. Two or three solves are described as they are; four or more compare the
 * earlier half with the later half.
 */
function progress(solved: ReportAttempt[], catalog: readonly ChallengeSummary[]): Question | null {
  const level = current(catalog, (c) => `${c.difficulty} ${languageLabel(c.language)}`);
  const groups = new Map<string, ReportAttempt[]>();
  const seen = new Set<string>();
  for (const a of chronological(solved)) {
    const label = level(a);
    if (!label || !activeToSolve(a) || seen.has(a.challenge)) continue;
    seen.add(a.challenge);
    groups.set(label, [...(groups.get(label) ?? []), a]);
  }
  const [label, group] = [...groups].sort((x, y) => y[1].length - x[1].length)[0] ?? [];
  if (!label || group.length < 2) return null;
  const times = group.map((a) => activeToSolve(a)!);
  const n = times.length,
    half = Math.floor(n / 2);
  const [before, after] = n >= 4 ? [median(times.slice(0, half))!, median(times.slice(n - half))!] : [times[0], times[n - 1]];
  const change = after <= before * FASTER ? "faster" : after >= before * SLOWER ? "slower" : "steady";
  const shift = `${duration(before)} → ${duration(after)}`;
  const answer =
    n < 4
      ? `Across your ${count(n)} ${label} challenges, the ${n === 2 ? "second" : "latest"} took ${duration(after)} of active editing; the first took ${duration(before)}.`
      : change === "faster"
        ? `You're getting faster at ${label}: about ${duration(before)} of active editing per solve at first, ${duration(after)} lately.`
        : change === "slower"
          ? `Your recent ${label} solves took longer: about ${duration(before)} of active editing at first, ${duration(after)} lately.`
          : `Steady at ${label}: about ${duration(after)} of active editing per solve, early on and lately.`;
  return {
    id: "progress",
    question: QUESTIONS.progress,
    answer,
    // Each solve in order, the oldest first: the shape of the change, at most the latest eight.
    visual: { kind: "bars", bars: group.slice(-8).map((a) => ({ label: a.challenge, value: activeToSolve(a)!, display: duration(activeToSolve(a)!) })) },
    detail: null,
    note: "Different challenges at the same level, so some are simply easier than others.",
    fyi: null,
    takeaway:
      change === "steady"
        ? null
        : n < 4
          ? `Across your ${count(n)} ${label} challenges: ${shift} of active editing.`
          : `${change === "faster" ? "Faster" : "Slower"} at ${label} lately: ${shift} of active editing per solve.`,
  };
}

const SUBMISSION_BUCKETS: [string, number, number][] = [
  ["1", 1, 1],
  ["2", 2, 2],
  ["3–4", 3, 4],
  ["5+", 5, Infinity],
];
/** Submissions up to each solve and whether the first passed; the examples first or not. */
function iterate(solved: ReportAttempt[]): Question | null {
  // Submissions up to the solve: anything after it doesn't make a solve iterative.
  const counted = chronological(solved).filter((a) => toSolve(a));
  if (!counted.length) return null;
  const steps = counted.map((a) => toSolve(a)!);
  const subs = steps.map((s) => s.submissions);
  const m = median(subs)!;
  const n = counted.length;
  const oneShot = subs.filter((x) => x === 1).length;
  const examplesFirst = steps.filter((s) => s.examplesFirst).length;
  const answer =
    n === 1
      ? subs[0] === 1
        ? "This solve passed on its first submission."
        : `This solve took ${plural(subs[0], "submission")}; the first didn't pass.`
      : n === 2
        ? subs[0] === subs[1]
          ? `Across your two solves, each took ${plural(subs[0], "submission")}.`
          : `Across your two solves: ${plural(subs[0], "submission")}, then ${subs[1]}.`
        : oneShot / n >= 0.5
          ? `Mostly one shot: ${oneShot} of ${n} solves passed on the first submission.`
          : `You iterate: about ${plural(m, "submission")} per solve, typically.`;
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
    detail:
      n === 1
        ? examplesFirst
          ? "You ran the examples before submitting."
          : null
        : examplesFirst === n
          ? `You ran the examples before submitting every time.`
          : examplesFirst
            ? `You ran the examples before submitting in ${examplesFirst} of ${n} solves.`
            : "You went straight to Submit each time, without running the examples first.",
    note: null,
    fyi: null,
    takeaway: n >= 3 ? answer : null,
  };
}

/**
 * After a failed submission (failed checks, fired rules or code that didn't compile or run): how
 * long until a better submission, and how many checks in between. Not time to the solve.
 */
function recovery(solved: ReportAttempt[]): Question | null {
  const firsts = solved.filter((a) => num(a.values.firstSubmit));
  const back = firsts.filter((a) => a.values.firstSubmit === 0).length;
  const recovered = solved.filter((a) => num(a.values.recoveryTime) && a.values.recoveryTime >= 0);
  if (!recovered.length && !back) return null;
  const detail = !back || firsts.length === 1
    ? null
    : back === firsts.length
      ? `${back === 2 ? "Both your solves" : back === 1 ? "Your solve" : `All ${back} solves`} came after a failed first submission.`
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
  const t = duration(median(recovered.map((a) => a.values.recoveryTime!))!);
  const checks = recovered.map((a) => a.values.recoveryChecks).filter(num);
  const c = median(checks);
  const between = c === null ? "" : c === 0 ? ", on your very next submission" : `, after ${plural(c, "check")} in between`;
  const answer =
    recovered.length === 1
      ? `After the failed submission, a better one came ${t} later${between}.`
      : recovered.length === 2
        ? `Across your two solves with a failed submission, a better one came about ${t} later${between}.`
        : `After a failed submission, a better one comes about ${t} later${between}, typically.`;
  return {
    id: "recovery",
    question: QUESTIONS.recovery,
    answer,
    visual: { kind: "turn", from: "failed submission", to: `better one ${t} later` },
    detail,
    note: null,
    fyi: null,
    takeaway:
      recovered.length < 2
        ? null
        : recovered.length === 2
          ? `Across two solves, a better submission came about ${t} after a failed one.`
          : `After a failed submission, a better one comes about ${t} later.`,
  };
}

const howMany = (n: number) => (n ? `${n}` : "none");
const CONFIDENCE: [string, string][] = [
  ["sure", "sure"],
  ["fairly", "fairly sure"],
  ["unsure", "unsure"],
  ["guessing", "guessing"],
];
/** Your answer after a solve ("how sure were you it would pass?") beside whether the first submission did. */
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
  const answer =
    sure.n && unsure.n
      ? `When you felt sure, your first submission passed ${of(sure)} times; when unsure, ${of(unsure)}.`
      : sure.n
        ? `You felt sure ${plural(sure.n, "time")}; your first submission passed in ${howMany(sure.passed)} of them.`
        : `You felt unsure ${plural(unsure.n, "time")}; your first submission passed in ${howMany(unsure.passed)} of them.`;
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
    note: "From your answer after each solve: how sure you were before submitting.",
    fyi: null,
    // Leads only when feeling sure and unsure went differently; otherwise there is nothing to sum up.
    takeaway: rows.length >= 3 && sure.n && unsure.n && sure.passed / sure.n !== unsure.passed / unsure.n ? answer : null,
  };
}

/** Active work up to the solve by difficulty. One level is described as it is. */
function difficulty(solved: ReportAttempt[], catalog: readonly ChallengeSummary[]): Question | null {
  const level = current(catalog, (c) => c.difficulty);
  const groups = ["easy", "medium", "hard"]
    .map((d) => ({ d, times: solved.filter((a) => level(a) === d && activeToSolve(a)).map((a) => activeToSolve(a)!) }))
    .filter((g) => g.times.length);
  if (!groups.length) return null;
  const bars = groups.map((g) => {
    const m = median(g.times)!;
    return { label: g.d, value: m, display: duration(m) };
  });
  const only = groups.length === 1 ? groups[0] : null;
  return {
    id: "difficulty",
    question: QUESTIONS.difficulty,
    answer: only
      ? only.times.length === 1
        ? `Your ${only.d} solve took ${bars[0].display} of active editing.`
        : only.times.length === 2
          ? `Across your two ${only.d} solves: about ${bars[0].display} of active editing per solve.`
          : `Your ${only.d} solves take about ${bars[0].display} of active editing, typically.`
      : (bars.map((b) => `${b.label} ${b.display}`).join(", ") + ` of active editing${groups.every((g) => g.times.length === 1) ? "" : ", typically"}.`).replace(/^./, (c) => c.toUpperCase()),
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
  const solvedIn = (r: (typeof rows)[number]) => `${r.solved} solved`;
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
          : `Mostly ${rows[0].label} (${solvedIn(rows[0])}), then ${rows.slice(1).map((r) => `${r.label} (${solvedIn(r)})`).join(", ")}.`,
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

/** A later solve of the same challenge, version and conditions, with fewer submissions. */
function repeat(solved: ReportAttempt[]): Question | null {
  const groups = new Map<string, ReportAttempt[]>();
  for (const a of solved.filter(clean)) {
    const key = JSON.stringify([a.challenge, a.revision, [...a.conditions].sort()]);
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  for (const group of groups.values()) {
    // Submissions up to each solve; any checks after a solve aren't "needed".
    const s = chronological(group.filter((a) => toSolve(a)));
    if (s.length < 2) continue;
    const before = toSolve(s[0])!.submissions,
      after = toSolve(s[s.length - 1])!.submissions,
      last = s[s.length - 1];
    if (after >= before) continue;
    return {
      id: "repeat",
      question: QUESTIONS.repeat,
      answer: `Back on ${last.challenge}, you needed ${plural(after, "submission")} instead of ${before}.`,
      visual: { kind: "turn", from: plural(before, "submission"), to: plural(after, "submission") },
      detail: null,
      note: "Same challenge, so familiarity helps.",
      fyi: null,
      takeaway: null,
    };
  }
  return null;
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
      ? `Solve another ${level.difficulty} ${languageLabel(level.language)} challenge to compare your pace on like-for-like work.`
      : "Solve two different challenges in one language at the same difficulty to compare your pace.",
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
    first ? "Solve a challenge again later; this shows whether it took fewer submissions." : "Solve a challenge, then solve it again later.",
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
    progress(solved, input.catalog),
    iterate(solved),
    recovery(solved),
    confidence(solved),
    difficulty(solved, input.catalog),
    languages(input.attempts, input.catalog),
    familiarity(input.attempts, input.catalog, input.profile),
    // Per-keystroke change sizes do not establish a person's revision style.
    typing(input.attempts),
    repeat(solved),
  ].filter((q): q is Question => q !== null);
  const active = questions.find((q) => /active editing/.test(q.answer));
  if (active) active.note = active.note ? `${active.note} ${ACTIVE_NOTE}` : ACTIVE_NOTE;
  // The strongest answers lead, in this order; one solve has nothing to sum up yet.
  const lead: QuestionId[] = ["progress", "recovery", "confidence", "iterate"];
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
