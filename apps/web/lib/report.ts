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
/**
 * Comparisons with other people. There is no player-facing aggregate path and no approved minimum
 * group size (docs/legal.md, publication boundaries), so the report states that reason; it never
 * implies a cohort was checked and came back small. Replace with a real cohort read once both exist.
 */
export const PEOPLE = {
  available: false,
  label: "not compared yet",
  reason:
    "Comparing you with other people needs an approved minimum group size first. Until then the report shows no figure about anyone else.",
} as const;
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

export interface Evidence {
  /** One short line under the visual: what it is based on. */
  basis: string;
  /** Uncertainty that belongs next to the finding. */
  caveat?: string;
  /** Definitions, sample and conditions, behind a disclosure. */
  details: string[];
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
  evidence: Evidence;
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
  evidence: Evidence;
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
  evidence: Evidence;
}
export type Cell =
  | { kind: "solved"; note: string }
  | { kind: "not-solved"; note: string }
  | { kind: "open"; note: string }
  | { kind: "withheld"; note: string }
  | { kind: "none"; note: string };
export interface ComparisonRow {
  challenge: string;
  revision: string;
  you: Cell;
  models: { slot: string; cell: Cell; receipt: ModelReceipt }[];
  state: "loading" | "ready" | "unavailable";
  /** Other people on the same revision and conditions, from a suppressed aggregate, or why not. */
  people: string;
}
export interface ComparisonChapter {
  id: "minds";
  title: "Same challenge. Different minds.";
  headline: string;
  rows: ComparisonRow[];
  columns: string[];
  evidence: Evidence;
}
export interface SurpriseChapter {
  id: "surprise";
  title: "The part you might not have noticed.";
  kind: "quiet-confidence" | "fewer-submissions" | "recovered";
  challenge: string;
  headline: string;
  before: { label: string; value: string };
  after: { label: string; value: string };
  evidence: Evidence;
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
  const aiDetail = heavy
    ? `You told us AI ${profile?.aiUse === "daily" ? "helps you code daily" : "writes much of the code you ship"}. The editor here offers no AI; what happens outside it isn't recorded.`
    : null;
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
      evidence: {
        basis: `${plural(done, "finished challenge")}, ${open} open${uploaded ? `, from this device and your uploads${rows.some((r) => r.fromUploads) ? ` (${rows.filter((r) => r.fromUploads).length} finished only in your uploads, not in this device's progress)` : ""}` : ", from this device"}.`,
        caveat:
          open > 0
            ? "Open isn't failed: it's work you haven't finished yet."
            : undefined,
        details: [
          ...(aiDetail ? [aiDetail] : []),
          "Finished means a submission passed every check and rule at least once. Open means started on this device or in your uploads without that.",
          "Revisited means more than one attempt or completion of the same challenge.",
          firsts.length
            ? `First submissions: ${plural(firsts.length, "attempt")} with a complete trace and a decided first submission. Runner failures, timeouts and cancellations don't count either way.`
            : "First-submission outcomes need a complete trace with a decided first submission; none is available yet.",
          "These are the challenges you chose, so they describe those tasks, not your ability in general.",
        ],
      },
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
    .filter((s) => s.score >= 2 && s.a.timeline.length >= 3)
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
    evidence: {
      basis: `One ${a.completed ? "finished" : "open"} attempt, ${plural(markers.length, "recorded checkpoint")}${a.source === "uploaded" ? ", from your uploads" : ""}.`,
      caveat: a.issues.length
        ? "Parts of this recording are missing, so some steps may not appear."
        : breaks
          ? `Gaps over 10 minutes are shortened (${plural(breaks, "break")}). Time away isn't labelled as anything.`
          : undefined,
      details: [
        `Revision ${a.revision.slice(0, 19)}…, ${a.started ? `started ${a.started.slice(0, 10)}` : "start not recorded"}.`,
        "Checkpoints are recorded events in order: example runs, submissions with their passing checks, leaving and coming back. No code is shown.",
        between === null
          ? "Edits between checks: unavailable for this attempt."
          : `A median of ${plural(between, "edit")} between one check and the next.`,
        ...a.issues,
      ],
    },
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
    evidence: {
      basis: `${plural(small + large, "edit")} across ${plural(eligible.length, "attempt")} with complete recordings.`,
      caveat:
        "A size, not a judgement: bigger edits include pastes and rewrites, and neither means a mistake or outside help.",
      details: [
        `Small means at most ${SMALL_EDIT_UNITS} characters inserted plus deleted in one edit; anything larger is a bigger piece.`,
        `The headline picks the strongest true description: at least ${SMALL_STEP_SHARE * 100}% small edits with a median of ${FREQUENT_CHECKS}+ checks per attempt, or at least ${LARGE_STEP_SHARE * 100}% bigger pieces. These cut-offs choose wording; they aren't norms.`,
        between === null
          ? "Edits between checks: unavailable."
          : `Median edits between one check and the next: ${number(between)}.`,
        returned.length
          ? `Came back after leaving: ${returned.join(", ")}.`
          : "No recorded returns to an unfinished attempt.",
        "Attempts with recording gaps or oversized edits are left out rather than counted as zero.",
        `People: ${PEOPLE.reason}`,
      ],
    },
  };
}

const MODEL_STATE: Partial<Record<ModelReceipt["state"], string>> = {
  stopped: "stopped",
  budget: "ran out of budget",
  refused: "refused",
  error: "provider error",
  "infrastructure-failed": "harness failed",
  queued: "queued",
  running: "running",
  missing: "no receipt",
  incompatible: "unverified",
  "receipt-unavailable": "unreadable",
};
function modelCell(r: ModelReceipt, conditions: readonly string[]): Cell {
  if (r.state === "completed" || ["stopped", "budget", "refused"].includes(r.state)) {
    const match = receiptMatch(r, conditions);
    if (match !== "matched")
      return { kind: "withheld", note: match.replace("-", " ") };
    return r.state === "completed"
      ? { kind: "solved", note: r.submissions === null ? "submissions not recorded" : plural(r.submissions, "submission") }
      : { kind: "not-solved", note: MODEL_STATE[r.state]! };
  }
  return { kind: "none", note: MODEL_STATE[r.state] ?? r.state };
}
/**
 * The people cell: a matched suppressed aggregate, a checked-and-too-small group, or the reason
 * there is no comparison. Never a nearest group, a pooled total or a zero.
 */
function peopleCell(read: CohortRead | "loading" | "unavailable" | undefined, a: ReportAttempt): string {
  if (read === "loading") return "reading…";
  if (read === "unavailable") return "can't be read";
  if (!read || read.state === "disabled") return PEOPLE.label;
  if (read.state === "unavailable") return "can't be read";
  const known = (prefix: string) => a.conditions.filter((c) => c.startsWith(prefix)).length === 1;
  if (!known("Runtime: ") || !known("Editor: ")) return "your conditions weren't recorded";
  const group = matchingGroup(read, a.conditions, a.practice === "repeat" ? "repeat" : "first");
  if (!group) return `fewer than ${read.minimum} comparable people`;
  const solved = `${Math.round(group.solved * 100)}% solved`;
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
  const rows: ComparisonRow[] = picked.map((a) => {
    const subs = submissions(a);
    const you: Cell = a.completed
      ? {
          kind: "solved",
          note: subs.length
            ? plural(subs.length, "submission")
            : a.values.submissions === null
              ? "submissions not recorded"
              : plural(a.values.submissions, "submission"),
        }
      : { kind: "open", note: subs.length ? `${subs.at(-1)!.passed}/${subs.at(-1)!.total} so far` : "open" };
    const got = input.receipts[a.revision];
    const people = peopleCell(input.cohorts?.[a.revision], a);
    if (!Array.isArray(got))
      return {
        challenge: a.challenge,
        revision: a.revision,
        you,
        people,
        models: [],
        state: got === "unavailable" ? "unavailable" : "loading",
      };
    const slots = new Map<string, ModelReceipt>();
    for (const r of got) {
      const slot = `${r.model} · ${r.reasoning}`;
      if (!slots.has(slot)) slots.set(slot, r);
    }
    return {
      challenge: a.challenge,
      revision: a.revision,
      you,
      people,
      state: "ready",
      models: [...slots].map(([slot, receipt]) => ({
        slot,
        receipt,
        cell: modelCell(receipt, a.conditions),
      })),
    };
  });
  const columns = [...new Set(rows.flatMap((r) => r.models.map((m) => m.slot)))].sort();
  const compared = rows.flatMap((r) =>
    r.models.filter((m) => m.cell.kind === "solved" || m.cell.kind === "not-solved"),
  );
  // One count per model and setting: pooling different models' single tries would read like a rate.
  const tally = new Map<string, { solved: number; tried: number }>();
  for (const m of compared) {
    const t = tally.get(m.slot) ?? { solved: 0, tried: 0 };
    t.tried++;
    if (m.cell.kind === "solved") t.solved++;
    tally.set(m.slot, t);
  }
  // The full slot (model · reasoning), so two settings of one model stay distinct.
  const named = [...tally].slice(0, 3).map(([slot, t]) => `${slot} solved ${t.solved} of ${t.tried}`);
  const perModel = tally.size > 3 ? `${named.join(", ")} and ${tally.size - 3} more` : named.join(", ");
  const ready = rows.every((r) => r.state !== "loading");
  // A failed read is not an empty result: absence is claimed only for receipts actually read.
  const unreadable = rows.filter((r) => r.state === "unavailable").length;
  const headline = !ready
    ? "Checking which models tried the same challenges…"
    : unreadable === rows.length
      ? "Model results can't be read right now."
      : !compared.length
        ? unreadable
          ? `No model has a comparable try on the challenges that could be read; ${unreadable} couldn't be read right now.`
          : "No model has a comparable try on these exact challenges yet."
        : `You solved ${rows.filter((r) => r.you.kind === "solved").length} of ${rows.length}. ${perModel}.${unreadable ? ` ${unreadable} couldn't be read right now.` : ""}`;
  return {
    wanted,
    chapter: {
      id: "minds",
      title: "Same challenge. Different minds.",
      headline,
      rows,
      columns,
      evidence: {
        basis: (() => {
          const read = rows.filter((r) => r.state === "ready").length;
          const tried = `${plural(rows.length, "challenge")} you tried`;
          if (!ready) return `${tried}; model results are being read.`;
          if (!read) return `${tried}. Model results couldn't be read.`;
          return read === rows.length
            ? `${tried}, checked against model tries on the exact same version.`
            : `${tried}; ${read} checked against model tries on the exact same version.`;
        })(),
        caveat:
          "Each model cell is one observed try, not a success rate. Your time and a model's latency aren't a race.",
        details: [
          "A model result counts only when its recorded runtime and editor diagnostics match yours; otherwise it's withheld.",
          "Models use edit, run and submit tools rather than a keyboard. Outside help on either side isn't recorded.",
          `People: ${PEOPLE.reason}`,
        ],
      },
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
      evidence: {
        basis: "Your optional answer after finishing, beside that attempt's first submission.",
        caveat:
          "You answered after finishing, so this isn't a prediction or a calibration score.",
        details: [
          "Only finished attempts are asked, so these answers can't show how sure people feel before a failure.",
        ],
      },
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
        evidence: {
          basis: `${plural(sorted.length, "finished attempt")} at the same challenge version and conditions.`,
          caveat: "Familiarity with this task helps; it doesn't show a general change.",
          details: ["Repeats are compared only with the same version, runtime and editor tools."],
        },
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
      evidence: {
        basis: "Submissions recorded in that attempt.",
        details: ["Runner failures and timeouts aren't counted as your failures."],
      },
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
          why: "Used only if comparisons with other people are switched on. Skip it any time; nothing here depends on it.",
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
