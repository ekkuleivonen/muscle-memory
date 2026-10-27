/**
 * The /stats report as a portrait (ENG-374, owner direction 27 October 2026): a few simple
 * questions about how you code, each answered only from evidence already recorded. A question the
 * evidence can't answer is left out, never filled with zeroes or explained. Comparisons are at most
 * one tiny FYI on the relevant answer. Pure and deterministic; see docs/developer-profile.md.
 */
import type { AttemptSummary } from "../../../packages/developer-profile/derive";
import { SMALL_EDIT_UNITS } from "../../../packages/developer-profile/registry";
import { receiptMatch, type ModelReceipt } from "../../../packages/model-runs/receipts";
import { defaultComparisons } from "../../../packages/model-runs/comparison";
import { languageLabel, type ChallengeSummary } from "./challenges";
import type { Profile } from "./profile";
import type { Progress } from "./progress";

export type Source = "device" | "uploaded";
export type ReportAttempt = AttemptSummary & { source: Source };

/** Wording cut-offs, not norms: they choose which true sentence answers a question. */
export const FREQUENT_CHECKS = 3;
export const LARGE_STEP_SHARE = 0.3;
/** Model results are read for at most this many of your solved challenges. */
export const COMPARISON_TASKS = 3;
/** Keystrokes per word for words per minute, the usual typing-test convention. */
export const KEYS_PER_WORD = 5;
/** Below this many code-character keystrokes a typing rate is too noisy to show. */
export const MIN_TYPED_KEYS = 50;

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

export type Visual =
  | { kind: "split"; parts: { label: string; value: number }[] }
  | { kind: "bars"; bars: { label: string; value: number; display: string }[] }
  | { kind: "number"; value: string; unit: string }
  | { kind: "turn"; from: string; to: string };
export interface Question {
  id: "start" | "iterate" | "difficulty" | "languages" | "typing" | "rewrite" | "recovery" | "repeat";
  question: string;
  answer: string;
  visual: Visual;
  /** At most one short line a player needs to read the answer correctly. */
  note: string | null;
  /** At most one tiny comparison on this answer. */
  fyi: string | null;
}
export interface NextStep {
  label: string;
  href: string;
}
export type ReceiptState = ModelReceipt[] | "loading" | "unavailable";
export interface ReportInput {
  catalog: readonly ChallengeSummary[];
  progress: Progress;
  attempts: readonly ReportAttempt[];
  profile: Profile | null;
  /** Model receipts by exact revision; absent means not requested. */
  receipts: Readonly<Record<string, ReceiptState>>;
}
export interface Report {
  /** Nothing started on this device or in uploaded history. */
  empty: boolean;
  questions: Question[];
  /** A short line when something was started but no question can be answered yet. */
  waiting: string | null;
  next: NextStep | null;
  profile: NextStep | null;
  /** Exact revisions whose model results could add the iterate FYI. */
  comparisonRevisions: { challenge: string; revision: string }[];
}

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

const SUBMITTED = /^(passed|failed|errored|cancelled): (\d+)\/(\d+) checks; (\d+) static rules$/;
export function submissions(a: AttemptSummary) {
  return a.timeline.flatMap((t) => {
    const m = SUBMITTED.exec(t.label);
    return m ? [{ result: m[1], passed: +m[2], total: +m[3], rules: +m[4], at: t.at }] : [];
  });
}

/**
 * Time from the start to the first edit, on one clock (same page session), over clean solves.
 * Nothing after it: the recorded session span includes pauses, runner waits and time after a
 * solve, so it is not implementation time. Never called reading or thinking.
 */
function start(solved: ReportAttempt[]): Question | null {
  const firsts = solved.filter((a) => num(a.values.firstEdit)).map((a) => a.values.firstEdit!);
  if (!firsts.length) return null;
  const m = median(firsts)!;
  return {
    id: "start",
    question: "How soon do you start typing?",
    answer: `Your first edit comes about ${duration(m)} in.`,
    visual: { kind: "number", value: duration(m), unit: "to your first edit" },
    note: firsts.length === 1 ? "From one solve so far." : null,
    fyi: null,
  };
}

const CHECK_BUCKETS: [string, number, number][] = [
  ["1", 1, 1],
  ["2–3", 2, 3],
  ["4–6", 4, 6],
  ["7+", 7, Infinity],
];
/** Checks per solve and how often the first submission passed. */
function iterate(solved: ReportAttempt[], fyi: string | null): Question | null {
  const counted = solved.filter((a) => num(a.values.examples) && num(a.values.submissions));
  if (!counted.length) return null;
  const checks = counted.map((a) => a.values.examples! + a.values.submissions!);
  const m = median(checks)!;
  const firsts = counted.filter((a) => num(a.values.firstSubmit));
  const oneShot = firsts.filter((a) => a.values.firstSubmit === 1).length;
  const answer =
    m >= FREQUENT_CHECKS
      ? `You iterate: a median of ${plural(m, "check")} per solve.`
      : firsts.length && oneShot / firsts.length >= 0.5
        ? `Mostly one shot: ${oneShot} of ${plural(firsts.length, "solve")} passed on the first submission.`
        : `A few checks per solve: ${plural(m, "check")} in a typical one.`;
  return {
    id: "iterate",
    question: "Do you iterate or go for one shot?",
    answer,
    // How many solves took 1, 2–3, 4–6 or 7+ checks: a shape, not a list of every solve.
    visual: {
      kind: "bars",
      bars: CHECK_BUCKETS.flatMap(([label, low, high]) => {
        const n = checks.filter((c) => c >= low && c <= high).length;
        return n ? [{ label: `${label} ${low === 1 && high === 1 ? "check" : "checks"}`, value: n, display: plural(n, "solve") }] : [];
      }),
    },
    note: null,
    fyi,
  };
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
/** Active time up to the solve (keystrokes, edits and selections, gaps over 30 s left out) by difficulty. */
function difficulty(solved: ReportAttempt[], catalog: readonly ChallengeSummary[]): Question | null {
  const level = current(catalog, (c) => c.difficulty);
  const order = ["easy", "medium", "hard"];
  const groups = order
    .map((d) => ({ d, times: solved.filter((a) => level(a) === d && num(a.values.activeToSolve) && a.values.activeToSolve! > 0).map((a) => a.values.activeToSolve!) }))
    .filter((g) => g.times.length);
  // A difference needs two levels; one level alone isn't an answer to "by difficulty".
  if (groups.length < 2) return null;
  const bars = groups.map((g) => {
    const m = median(g.times)!;
    return { label: g.d, value: m, display: duration(m) };
  });
  return {
    id: "difficulty",
    question: "How long do harder challenges take you?",
    answer: bars.map((b) => `${b.label} ${b.display}`).join(", ") + " of active time, typically.",
    visual: { kind: "bars", bars },
    note: "Active time counts the minutes you were typing, editing or selecting before the solve.",
    fyi: null,
  };
}

/** Languages by actual work: solves and active time per language. */
function languages(attempts: readonly ReportAttempt[], catalog: readonly ChallengeSummary[]): Question | null {
  const lang = current(catalog, (c) => c.language);
  const work = new Map<string, { active: number; solves: Set<string> }>();
  for (const a of attempts) {
    const l = lang(a);
    if (!l || !clean(a) || !num(a.values.active) || a.values.active <= 0) continue;
    const w = work.get(l) ?? { active: 0, solves: new Set<string>() };
    w.active += a.values.active;
    if (a.completed) w.solves.add(a.challenge);
    work.set(l, w);
  }
  if (!work.size) return null;
  const bars = [...work]
    .sort((x, y) => y[1].active - x[1].active)
    .map(([l, w]) => ({ label: languageLabel(l), value: w.active, display: `${duration(w.active)}${w.solves.size ? ` · ${plural(w.solves.size, "solve")}` : ""}` }));
  return {
    id: "languages",
    question: "Which languages do you actually code in?",
    answer: bars.length === 1 ? `All ${bars[0].label} so far.` : `Mostly ${bars[0].label}, then ${bars.slice(1).map((b) => b.label).join(", ")}.`,
    visual: { kind: "bars", bars },
    note: null,
    fyi: null,
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
    question: "How fast do you type when you're coding?",
    answer: `About ${wpm} words a minute while you're typing code.`,
    visual: { kind: "number", value: `${wpm}`, unit: "wpm" },
    note: "Pastes, arrows, deletions and pauses don't count.",
    fyi: null,
  };
}

/**
 * Edit sizes only: small edits vs bigger pieces. Inserted and deleted totals include starter text,
 * pastes and replacements, so they can't say how much of what you typed survived.
 */
function rewrite(attempts: readonly ReportAttempt[]): Question | null {
  const usable = attempts.filter((a) => clean(a) && num(a.values.smallEdits) && num(a.values.largeEdits));
  const small = usable.reduce((n, a) => n + a.values.smallEdits!, 0),
    large = usable.reduce((n, a) => n + a.values.largeEdits!, 0);
  if (small + large === 0) return null;
  const bigShare = large / (small + large);
  return {
    id: "rewrite",
    question: "Small edits or bigger pieces?",
    answer:
      bigShare >= LARGE_STEP_SHARE
        ? `Often bigger pieces: ${Math.round(bigShare * 100)}% of your edits change more than ${SMALL_EDIT_UNITS} characters at once.`
        : `Mostly small edits: ${Math.round((1 - bigShare) * 100)}% change ${SMALL_EDIT_UNITS} characters or fewer.`,
    visual: { kind: "split", parts: [{ label: `small edits (≤${SMALL_EDIT_UNITS} chars)`, value: small }, { label: "bigger pieces", value: large }] },
    note: "Bigger pieces include pastes; neither means a mistake.",
    fyi: null,
  };
}

/**
 * Solves whose first submission failed. Only the count: `recoveryChecks` measures checks to the
 * first improvement, not to the solve, so it isn't presented as either here.
 */
function recovery(solved: ReportAttempt[]): Question | null {
  const back = solved.filter((a) => clean(a) && a.values.firstSubmit === 0);
  if (!back.length) return null;
  return {
    id: "recovery",
    question: "What happens after a failed submission?",
    answer: `You kept going: ${plural(back.length, "solve")} came after a failed first submission.`,
    visual: { kind: "turn", from: "first submission failed", to: `solved ${back.length}×` },
    note: null,
    fyi: null,
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
    const s = group.filter((a) => num(a.values.submissions)).sort((x, y) => (x.started ?? x.last).localeCompare(y.started ?? y.last));
    if (s.length < 2) continue;
    const first = s[0],
      last = s[s.length - 1];
    if (last.values.submissions! >= first.values.submissions!) continue;
    return {
      id: "repeat",
      question: "Did coming back to a challenge change anything?",
      answer: `Back on ${last.challenge}, you needed ${plural(last.values.submissions!, "submission")} instead of ${first.values.submissions}.`,
      visual: { kind: "turn", from: plural(first.values.submissions!, "submission"), to: plural(last.values.submissions!, "submission") },
      note: "Same challenge, so familiarity helps.",
      fyi: null,
    };
  }
  return null;
}

/**
 * One model FYI for the iterate answer: the median submissions of comparable model solves. Each
 * model try counts once, however many times you solved that challenge.
 */
function modelFyi(solved: ReportAttempt[], receipts: ReportInput["receipts"]): string | null {
  const tries = new Map<string, number>();
  for (const a of solved) {
    const got = receipts[a.revision];
    if (!Array.isArray(got)) continue;
    for (const { receipt } of defaultComparisons(got))
      if (receipt?.state === "completed" && num(receipt.submissions) && receiptMatch(receipt, a.conditions) === "matched")
        tries.set(JSON.stringify([a.revision, receipt.model, receipt.reasoning, receipt.try]), receipt.submissions);
  }
  const m = median([...tries.values()]);
  return m === null ? null : `FYI: models that solved the same challenges needed ${plural(m, "submission")}, typically.`;
}

function next(input: ReportInput, started: Set<string>): NextStep | null {
  const { catalog, progress } = input;
  const open = catalog.find((c) => progress[c.key] && !progress[c.key].completedAt && c.runnable);
  if (open) return { label: `Resume ${open.key} · ${open.title}`, href: `/challenges/${open.key}` };
  if (!started.size) return { label: "Pick a language and start", href: "/start" };
  const fresh = catalog.find((c) => c.runnable && !progress[c.key] && !started.has(c.key));
  return fresh ? { label: `Next: ${fresh.key} · ${fresh.title}`, href: `/challenges/${fresh.key}` } : null;
}

export function buildReport(input: ReportInput): Report {
  const known = new Set(input.catalog.map((c) => c.key));
  const started = new Set([...Object.keys(input.progress), ...input.attempts.map((a) => a.challenge)].filter((k) => known.has(k)));
  const solved = input.attempts.filter((a) => a.completed && clean(a) && known.has(a.challenge));
  const comparisonRevisions = [...new Map(
    [...solved].reverse().filter((a) => a.revision.startsWith("sha256:")).map((a) => [a.revision, { challenge: a.challenge, revision: a.revision }]),
  ).values()].slice(0, COMPARISON_TASKS);
  const questions = [
    start(solved),
    iterate(solved, modelFyi(solved, input.receipts)),
    recovery(solved),
    rewrite(input.attempts),
    typing(input.attempts),
    difficulty(solved, input.catalog),
    languages(input.attempts, input.catalog),
    repeat(solved),
  ].filter((q): q is Question => q !== null);
  return {
    empty: !started.size,
    questions,
    waiting: started.size && !questions.length ? "Solve a challenge and your answers start here." : null,
    next: next(input, started),
    profile:
      questions.length && !input.profile?.experience
        ? { label: "Add your coding experience (optional)", href: "/settings/profile/experience" }
        : null,
    comparisonRevisions,
  };
}
