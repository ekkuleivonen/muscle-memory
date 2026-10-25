/**
 * The outcome of a pull request as evidence: what changed, what the checks showed, how the work
 * was verified and recovered, what help was on, and what is not known. Read from the same
 * observations as the pull request itself (./pulls, ./feedback, ./result), never written back.
 *
 * Every line is one of three kinds, and says which:
 * - observed: a fact in the records (a check passed, a hint was released);
 * - missing: something the records cannot show (code not kept, a capture gap, production);
 * - inferred: a limited reading of observed facts, worded as such.
 *
 * There is no score, rank or badge, and nothing here says anything about the person's ability
 * or their use of AI: timing comes last, and pastes, page switches and waiting on the test
 * runner are reported as what happened, not as skill.
 */
import {
  casesRun,
  editableFiles,
  type Revision,
} from "../../../packages/content/model";
import {
  runFeedback,
  type WorkspaceRecord,
} from "../../../packages/domain/workspace";
import { diffLines, diffStats } from "./diff";
import { feedbackOf, openRequired } from "./feedback";
import { pullRequestDetail } from "./pulls";
import { metricsOf } from "./result";

export type EvidenceStatus = "observed" | "missing" | "inferred";

/** How the code was last checked locally before the pull request's latest push. */
export type BeforePush =
  /** A local run on exactly the pushed code, every visible case passing. */
  | "tested-passing"
  /** A local run on exactly the pushed code, with failures or errors. */
  | "tested-failing"
  /** Every earlier local run was on code that differs from what was pushed. */
  | "changed-after"
  /**
   * Local runs happened, but none can be matched to the pushed code: an artifact is missing
   * or cut short, or the same code was only tested against another version of the ticket.
   */
  | "unknown"
  /** No local run before pushing. */
  | "none";

/** The numbers the outcome is described from: all observed, or null where not known. */
/** One push's CI result, as recorded when its checks finished. */
export interface Submission {
  /** 1 for the first submission (opening the pull request), then 2, 3, … */
  push: number;
  result: string;
  passed: number;
  total: number;
  /** Recorded as `merged` (before capture 1.4.0): passing, without the breakdown. */
  legacy: boolean;
  /** The cases in the repo's test file; null if unknown. */
  visible: { passed: number; total: number } | null;
  /** The cases only CI runs; null if unknown, total 0 when the issue has none. */
  hidden: { passed: number; total: number } | null;
}

export interface EvidenceFacts {
  number: number;
  state: "open" | "merged" | "closed";
  /** Pushes to this pull request, opening included. */
  pushes: number;
  /** Each editable file against its starting version; null when the code was not kept. */
  changed: { path: string; added: number; removed: number }[] | null;
  checks: {
    result: string;
    passed: number;
    total: number;
    /** Recorded as `merged` (before capture 1.4.0): passing, without the breakdown. */
    legacy: boolean;
  };
  /** The cases in the repo's test file, as CI ran them on the latest push; null if unknown. */
  visible: { passed: number; total: number } | null;
  /** The cases only CI runs; null if unknown, total 0 when the issue has none. */
  hidden: { passed: number; total: number } | null;
  /**
   * The first submitted push's checks, apart from the latest's (the same push when it was opened
   * once); null when that push's record isn't available.
   */
  first: Submission | null;
  /**
   * What came back on this pull request before its latest push, by recorded push order: earlier
   * pushes whose checks did not pass, and review comments on earlier pushes. Zero when opened once.
   */
  beforeLatest: { failedChecks: number; reviews: number };
  verification: {
    /** Local test runs since the previous pull request. */
    runs: number;
    /** Of those, runs in which every visible case passed. */
    green: number;
    beforePush: BeforePush;
  };
  recovery: {
    /** Local runs that reached the tests with failures, before the first green one. */
    failedRuns: number;
    /** Local runs that never reached the tests (an error, a timeout), before the first green one. */
    erroredRuns: number;
    /** Pushes to this pull request whose checks did not pass. */
    failedPushes: number;
    /** Earlier pull requests for the issue in this attempt, closed without merging. */
    closedBefore: number;
    findings: {
      raised: number;
      byCode: number;
      byReply: number;
      byResolve: number;
      open: number;
    };
  };
  assistance: {
    hints: number;
    /** Teammate comments released into the ticket while working (not its opening thread). */
    comments: number;
    /** The editor features on in the IDE sessions of this attempt; null when not recorded. */
    editorFeatures: string[] | null;
    /** Times the editor showed type errors or a hover type. */
    typeHelp: number;
    pastes: number;
  };
  timing: {
    /** Active seconds: gaps between activity, each counted up to a minute. */
    active: number;
    /** Wall-clock seconds from the first activity to `until`. */
    elapsed: number;
    /** Times the page was hidden while working. */
    hidden: number;
  };
  /** Capture gaps in this attempt: stretches whose activity is not known. */
  gaps: number;
  /**
   * Open pull requests only, from the merge gate's verdict (EvidenceInput.blocker): what keeps its
   * checks from counting now. Null when the gate's verdict wasn't given, so nothing is guessed.
   */
  stale: {
    /** A newer push hasn't reported its checks yet. */
    pending: boolean;
    /** The code changed after the latest push. */
    codeChanged: boolean;
    /** The saved code couldn't be compared with the push. */
    codeUnconfirmed: boolean;
    /** The checks ran against a version of the ticket this attempt is no longer on. */
    revision: boolean;
  } | null;
  /** Open findings that must be resolved before merging. */
  openRequired: number;
}

export interface EvidenceItem {
  id: string;
  status: EvidenceStatus;
  /** Whether it reads well for the work: shown as pass, fail or neither. */
  tone: "pass" | "fail" | "neutral";
  text: string;
}

export type SectionId =
  | "changed"
  | "correctness"
  | "regression"
  | "verification"
  | "recovery"
  | "assistance"
  | "timing";

export interface EvidenceSection {
  id: SectionId;
  title: string;
  items: EvidenceItem[];
}

/** Something to do before merging; `where` is the place to do it. */
export interface EvidenceAction {
  id:
    | "checks"
    | "checks-pending"
    | "code-changed"
    | "code-unconfirmed"
    | "revision"
    | "review";
  /** `wait`: nothing to do but let CI finish. */
  where: "ide" | "findings" | "wait";
  text: string;
}

export interface Evidence {
  facts: EvidenceFacts;
  sections: EvidenceSection[];
  actions: EvidenceAction[];
}

/**
 * Why a pull request can't be merged now, as the one merge gate decides it (ENG-322's
 * `mergeEligibility` in lib/merge.ts); null when it can. Mirrored here so this module stands
 * alone; keep the two in step.
 */
export type MergeBlocker =
  | "not-open"
  | "other-merged"
  | "checks-pending"
  | "checks"
  | "revision"
  | "code-changed"
  | "code-unconfirmed"
  | "review";

export interface EvidenceInput {
  /** The pull request's attempt (./attempts): its records only. */
  records: readonly WorkspaceRecord[];
  /** The issue's permanent id. */
  issue: string;
  number: number;
  revisionFor: (id: string) => Revision | undefined;
  /**
   * The merge gate's verdict for an open pull request. Stale checks and what to do before
   * merging come from it alone; undefined when not known, and then no staleness is claimed.
   */
  blocker?: MergeBlocker | null;
  /**
   * When the outcome is read: the merge, or now for an open pull request. Nothing this issue
   * records after it counts, so later work never changes an earlier outcome.
   */
  until: string;
}

/** The records with this issue's observations after `until` left out; the rest is kept. */
function bounded(
  records: readonly WorkspaceRecord[],
  issue: string,
  until: string,
): WorkspaceRecord[] {
  return records.filter((record) => {
    if (record.kind !== "observation") return true;
    try {
      const value = JSON.parse(record.payload);
      return (
        value?.issue !== issue ||
        typeof value.occurredAt !== "string" ||
        value.occurredAt <= until
      );
    } catch {
      return true;
    }
  });
}

interface Raw {
  type: string;
  occurredAt: string;
  issue: string | null;
  issueRevision: string | null;
  data: Record<string, unknown>;
}

function raw(records: readonly WorkspaceRecord[], issue: string): Raw[] {
  return records.flatMap((record): Raw[] => {
    if (record.kind !== "observation") return [];
    try {
      const value = JSON.parse(record.payload);
      if (value?.issue !== issue || typeof value.occurredAt !== "string")
        return [];
      return [
        {
          type: String(value.type),
          occurredAt: value.occurredAt,
          issue: value.issue,
          issueRevision:
            typeof value.issueRevision === "string"
              ? value.issueRevision
              : null,
          data: value.data ?? {},
        },
      ];
    } catch {
      return [];
    }
  });
}

/** Passed out of total for the cases matching `keep`, from a checks run's raw outcome. */
function split(
  raw: unknown,
  revision: Revision | undefined,
  keep: (visible: boolean) => boolean,
): { passed: number; total: number } | null {
  const outcome = raw as {
    phase?: string;
    cases?: { output?: { text: string; truncated: boolean } }[];
  } | null;
  if (!revision) return null;
  const cases = casesRun(revision.checks.cases, "pull-request");
  const chosen = cases.flatMap((c, i) => (keep(c.visible) ? [i] : []));
  if (!chosen.length) return { passed: 0, total: 0 };
  if (outcome?.phase !== "tests" || !outcome.cases) return null;
  const { passed } = runFeedback(cases, outcome.cases);
  return {
    passed: chosen.filter((i) => passed[i]).length,
    total: chosen.length,
  };
}

/** A code artifact's files as text, or null when it can't stand for the code (cut short). */
function artifactFiles(
  records: readonly WorkspaceRecord[],
  id: string,
): Record<string, string> | null {
  const record = records.find(
    (r) => r.kind === "artifact" && r.recordId === id,
  );
  if (!record) return null;
  try {
    const value = JSON.parse(record.payload);
    const files = (value?.files ?? null) as Record<
      string,
      { text?: unknown; capture?: { truncated?: boolean } }
    > | null;
    if (!files || value.truncated === true) return null;
    const out: Record<string, string> = {};
    for (const [path, file] of Object.entries(files)) {
      if (typeof file?.text !== "string" || file.capture?.truncated)
        return null;
      out[path] = file.text;
    }
    return out;
  } catch {
    return null;
  }
}

const sameFiles = (a: Record<string, string>, b: Record<string, string>) => {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => Object.hasOwn(b, k) && a[k] === b[k])
  );
};

/**
 * Whether the latest push's exact code was tested locally first. A local run counts only when
 * it finished before that push started, ran the same code (the same artifact, or artifacts with
 * identical, complete files) and the same version of the ticket. Order alone proves nothing: a
 * run's result can arrive after the code was edited, and it still belongs to the code it started
 * with. When the records can't settle it, it is "unknown", never assumed.
 */
function beforePush(
  records: readonly WorkspaceRecord[],
  observations: readonly Raw[],
  latest: Raw | undefined,
  revisionFor: (id: string) => Revision | undefined,
): BeforePush {
  if (!latest) return "unknown";
  const runId = String(latest.data.runId);
  // The push started when its checks run was first recorded (queued).
  const started = observations
    .filter(
      (o) =>
        o.type === "observation.workspace.run" &&
        String(o.data.runId) === runId,
    )
    .reduce(
      (min, o) => (o.occurredAt < min ? o.occurredAt : min),
      latest.occurredAt,
    );
  const local = observations.filter(
    (o) =>
      o.type === "observation.workspace.run" &&
      o.data.purpose !== "pull-request" &&
      TERMINAL.has(String(o.data.status)) &&
      o.occurredAt <= started,
  );
  if (!local.length) return "none";
  const pushedId = String(latest.data.codeArtifactId ?? "");
  const pushed = artifactFiles(records, pushedId);
  let unknown = false;
  for (const run of [...local].reverse()) {
    const id = String(run.data.codeArtifactId ?? "");
    const files = id ? artifactFiles(records, id) : null;
    const same =
      (id !== "" && id === pushedId) ||
      (files !== null && pushed !== null && sameFiles(files, pushed));
    if (!same) {
      // Different code only when both sides are known in full.
      if (files === null || pushed === null) unknown = true;
      continue;
    }
    if (run.issueRevision !== latest.issueRevision) {
      unknown = true;
      continue;
    }
    const revision = revisionFor(run.issueRevision ?? "");
    const outcome = run.data.outcome as
      | {
          phase?: string;
          cases?: { output?: { text: string; truncated: boolean } }[];
        }
      | undefined;
    if (!revision) {
      unknown = true;
      continue;
    }
    const green =
      outcome?.phase === "tests" &&
      !!outcome.cases &&
      (() => {
        const { correct, total } = runFeedback(
          casesRun(revision.checks.cases, "local"),
          outcome.cases!,
        );
        return total > 0 && correct === total;
      })();
    return green ? "tested-passing" : "tested-failing";
  }
  return unknown ? "unknown" : "changed-after";
}

const TERMINAL = new Set([
  "result",
  "user-error",
  "runner-error",
  "timeout",
  "cancelled",
]);

/** The facts behind one pull request's outcome, or null when there is no such pull request. */
export function evidenceFacts(input: EvidenceInput): EvidenceFacts | null {
  const { issue, number, revisionFor, blocker, until } = input;
  const records = bounded(input.records, issue, until);
  const detail = pullRequestDetail(records, issue, number, revisionFor);
  if (!detail) return null;
  const { pull } = detail;
  const revision = revisionFor(pull.issueRevision);
  const observations = raw(records, issue);

  const changed =
    revision && detail.code
      ? Object.entries(editableFiles(revision.workspace)).map(
          ([path, start]) => ({
            path,
            ...diffStats(diffLines(start.text, detail.code![path]?.text ?? "")),
          }),
        )
      : null;

  const runs = detail.timeline.filter((e) => e.kind === "run");
  const firstGreen = runs.findIndex((r) => r.tested && r.passed === r.total);
  const beforeGreen = firstGreen === -1 ? runs : runs.slice(0, firstGreen);

  const feedback = feedbackOf(records, issue, revisionFor);
  const threads = feedback.threads.filter(
    (t) => t.number === number && t.severity !== "info",
  );
  // A finding counts once, however often it reopened: its latest thread says how it ended.
  const latest = new Map(threads.map((t) => [t.comment, t]));
  const findings = [...latest.values()];

  const metrics = metricsOf(records, issue, until, revisionFor);
  const features = observations
    .filter((o) => o.type === "observation.workspace.opened")
    .flatMap((o) => {
      const editor = o.data.editor as { features?: unknown } | undefined;
      return Array.isArray(editor?.features)
        ? [editor.features.map(String)]
        : [];
    });
  const started = observations.reduce<string | null>(
    (min, o) => (min === null || o.occurredAt < min ? o.occurredAt : min),
    null,
  );
  // Each push of this pull request as recorded, and its checks run's raw outcome.
  const pushes = observations.filter(
    (o) =>
      o.type === "observation.workspace.pull-request" &&
      Number(o.data.number) === number,
  );
  const outcomes = new Map(
    observations
      .filter(
        (o) =>
          o.type === "observation.workspace.run" &&
          o.data.purpose === "pull-request" &&
          o.data.outcome !== undefined,
      )
      .map((o) => [String(o.data.runId), o.data.outcome]),
  );
  const opening = pushes.find((o) => Number(o.data.push) === 1);
  const first: Submission | null = opening
    ? {
        push: 1,
        result:
          opening.data.result === "merged"
            ? "checks-passed"
            : String(opening.data.result),
        passed: Number(opening.data.passed),
        total: Number(opening.data.total),
        legacy: opening.data.result === "merged",
        visible: split(
          outcomes.get(String(opening.data.runId)),
          revisionFor(opening.issueRevision ?? ""),
          (visible) => visible,
        ),
        hidden: split(
          outcomes.get(String(opening.data.runId)),
          revisionFor(opening.issueRevision ?? ""),
          (visible) => !visible,
        ),
      }
    : null;
  const latestPush = Math.max(0, ...pushes.map((o) => Number(o.data.push)));
  // The latest is the highest push number, as the merge gate reads it, so a late result from an
  // older push never stands for the latest.
  const last = pushes.findLast((o) => Number(o.data.push) === latestPush);
  const lastResult = last ? String(last.data.result) : pull.result;
  const beforeLatest = {
    failedChecks: pushes.filter(
      (o) =>
        Number(o.data.push) < latestPush &&
        o.data.result !== "checks-passed" &&
        o.data.result !== "merged",
    ).length,
    reviews: observations.filter(
      (o) =>
        o.type === "observation.workspace.comment" &&
        o.data.where === "review" &&
        Number(o.data.pullRequest) === number &&
        Number(o.data.push) < latestPush,
    ).length,
  };
  const closedBefore = new Set(
    observations
      .filter(
        (o) =>
          o.type === "observation.board.closed" &&
          Number(o.data.pullRequest) < number,
      )
      .map((o) => Number(o.data.pullRequest)),
  ).size;

  return {
    number,
    state: pull.state,
    // Recorded push numbers, so a lost record never makes a later push look like the first.
    pushes: Math.max(pull.pushes, latestPush),
    changed,
    checks: {
      result: lastResult === "merged" ? "checks-passed" : lastResult,
      passed: last ? Number(last.data.passed) : pull.passed,
      total: last ? Number(last.data.total) : pull.total,
      legacy: lastResult === "merged",
    },
    visible: split(
      last ? outcomes.get(String(last.data.runId)) : detail.outcome,
      revisionFor(last?.issueRevision ?? pull.issueRevision),
      (visible) => visible,
    ),
    hidden: split(
      last ? outcomes.get(String(last.data.runId)) : detail.outcome,
      revisionFor(last?.issueRevision ?? pull.issueRevision),
      (visible) => !visible,
    ),
    first,
    beforeLatest,
    verification: {
      runs: runs.length,
      green: runs.filter((r) => r.tested && r.passed === r.total).length,
      beforePush: beforePush(records, observations, last, revisionFor),
    },
    recovery: {
      failedRuns: beforeGreen.filter((r) => r.tested).length,
      erroredRuns: beforeGreen.filter((r) => !r.tested).length,
      failedPushes: detail.timeline.filter(
        (e) =>
          e.kind === "checks" &&
          e.result !== "checks-passed" &&
          e.result !== "merged",
      ).length,
      closedBefore,
      findings: {
        raised: findings.length,
        byCode: findings.filter((t) => t.resolved?.by === "code").length,
        byReply: findings.filter((t) => t.resolved?.by === "reply").length,
        byResolve: findings.filter((t) => t.resolved?.by === "resolve").length,
        open: findings.filter((t) => !t.resolved).length,
      },
    },
    assistance: {
      hints: metrics.h,
      comments: feedback.released.filter((r) => r.kind === "comment").length,
      editorFeatures: features.length
        ? [...new Set(features.flat())].sort()
        : null,
      typeHelp: observations.filter(
        (o) => o.type === "observation.workspace.assist",
      ).length,
      pastes: metrics.ps,
    },
    timing: {
      active: metrics.t,
      elapsed: started
        ? Math.max(
            0,
            Math.round((Date.parse(until) - Date.parse(started)) / 1000),
          )
        : 0,
      hidden: metrics.lt,
    },
    gaps: observations.filter(
      (o) => o.type === "observation.workspace.capture-gap",
    ).length,
    stale:
      blocker === undefined
        ? null
        : {
            pending: pull.state === "open" && blocker === "checks-pending",
            codeChanged: pull.state === "open" && blocker === "code-changed",
            codeUnconfirmed:
              pull.state === "open" && blocker === "code-unconfirmed",
            revision: pull.state === "open" && blocker === "revision",
          },
    openRequired: openRequired(feedback, number, revisionFor).length,
  };
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** "once", "twice", "3 times". */
const times = (n: number) =>
  n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;

function minutes(seconds: number): string {
  if (seconds < 60) return "under a minute";
  const m = Math.round(seconds / 60);
  if (m < 60) return plural(m, "minute");
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

const observed = (
  id: string,
  text: string,
  tone: EvidenceItem["tone"] = "neutral",
): EvidenceItem => ({ id, status: "observed", tone, text });
const missing = (id: string, text: string): EvidenceItem => ({
  id,
  status: "missing",
  tone: "neutral",
  text,
});
const inferred = (id: string, text: string): EvidenceItem => ({
  id,
  status: "inferred",
  tone: "neutral",
  text,
});

/** The facts as sections of plain lines, in the order they matter: timing last. */
export function describe(facts: EvidenceFacts): EvidenceSection[] {
  const {
    checks,
    visible,
    hidden,
    verification,
    recovery,
    assistance,
    timing,
  } = facts;
  const passing = checks.result === "checks-passed";
  const gaps =
    facts.gaps > 0
      ? [
          missing(
            "gaps",
            `Some activity during this work isn't available (${plural(facts.gaps, "gap")}), so counts below may be low.`,
          ),
        ]
      : [];

  const changed: EvidenceItem[] = [];
  if (!facts.changed)
    changed.push(
      missing("code", "The code for this pull request isn't available."),
    );
  else {
    const touched = facts.changed.filter((f) => f.added || f.removed);
    const added = touched.reduce((n, f) => n + f.added, 0);
    const removed = touched.reduce((n, f) => n + f.removed, 0);
    changed.push(
      touched.length
        ? observed(
            "diff",
            `${plural(touched.length, "file")} changed from the starting code: ${touched
              .map((f) => f.path)
              .join(", ")} (+${added} −${removed}).`,
          )
        : observed("diff", "No changes from the starting code.", "fail"),
    );
  }
  changed.push(
    observed(
      "pushes",
      facts.pushes === 1
        ? "Opened once, with no further pushes."
        : `Opened, then pushed ${times(facts.pushes - 1)} more.`,
    ),
  );

  const correctness: EvidenceItem[] = [];
  const { first, beforeLatest } = facts;
  /** "CI: 11 of 15 checks passed", or what happened instead. */
  const ciText = (c: {
    result: string;
    passed: number;
    total: number;
    legacy: boolean;
  }) =>
    c.legacy
      ? "CI passed (the per-check breakdown isn't available)"
      : c.result === "checks-errored"
        ? "CI errored before reaching the tests"
        : c.result === "cancelled"
          ? "CI was cancelled"
          : `CI: ${c.passed} of ${c.total} checks passed`;
  const tone = (result: string): EvidenceItem["tone"] =>
    result === "checks-passed" ? "pass" : "fail";
  if (facts.pushes > 1) {
    correctness.push(
      first
        ? observed(
            "first",
            `First submitted (push 1): ${ciText(first)}.`,
            tone(first.result),
          )
        : missing(
            "first",
            "What CI said on the first submission (push 1) isn't available.",
          ),
    );
    const after = [
      beforeLatest.failedChecks &&
        `failing CI on ${plural(beforeLatest.failedChecks, "earlier push", "earlier pushes")}`,
      beforeLatest.reviews &&
        `${plural(beforeLatest.reviews, "review comment")} on earlier pushes`,
    ].filter(Boolean);
    correctness.push(
      observed(
        "ci",
        `Latest (push ${facts.pushes}${after.length ? `, pushed after ${after.join(" and ")}` : ""}): ${ciText(checks)}.`,
        tone(checks.result),
      ),
    );
  } else
    correctness.push(
      observed(
        "ci",
        `First submitted (push 1), with no later pushes: ${ciText(checks)}.`,
        tone(checks.result),
      ),
    );
  if (visible && visible.total)
    correctness.push(
      observed(
        "visible",
        `The repo's own tests: ${visible.passed} of ${visible.total} passed.`,
        visible.passed === visible.total ? "pass" : "fail",
      ),
    );
  correctness.push(
    missing(
      "production",
      "How it behaves in production isn't known: these checks ran in the test runner, and nothing was deployed or monitored.",
    ),
  );

  const regression: EvidenceItem[] = [];
  if (!hidden)
    regression.push(
      missing(
        "hidden",
        "Which of CI's extra checks passed isn't available for this push.",
      ),
    );
  else if (!hidden.total)
    regression.push(
      missing(
        "hidden",
        "This issue has no checks beyond the repo's test file, so nothing tested behaviour you couldn't see.",
      ),
    );
  else {
    regression.push(
      observed(
        "hidden",
        `Checks not in the repo's test file: ${hidden.passed} of ${hidden.total} passed.`,
        hidden.passed === hidden.total ? "pass" : "fail",
      ),
    );
    if (hidden.passed === hidden.total)
      regression.push(
        inferred(
          "generalises",
          "Passing checks you didn't see suggests the fix handles more than the cases you were shown. It is not proof that nothing else broke.",
        ),
      );
  }

  const verify: EvidenceItem[] = [
    observed(
      "runs",
      verification.runs
        ? `Ran the tests ${times(verification.runs)} before this pull request's latest push; ${verification.green} passed every visible test.`
        : "Didn't run the tests before pushing; CI was the first check.",
    ),
  ];
  if (verification.runs)
    verify.push(
      verification.beforePush === "tested-passing"
        ? observed(
            "before-push",
            "The code pushed last was tested first, and passed.",
            "pass",
          )
        : verification.beforePush === "tested-failing"
          ? observed(
              "before-push",
              "The code pushed last was tested first, with failures.",
              "fail",
            )
          : verification.beforePush === "changed-after"
            ? observed(
                "before-push",
                "The code pushed last differs from every test run before it, so only CI checked it.",
              )
            : missing(
                "before-push",
                "Whether the code pushed last was tested first can't be established: no earlier test run can be matched to it.",
              ),
    );

  const recover: EvidenceItem[] = [];
  const setbacks = recovery.failedRuns + recovery.erroredRuns;
  if (setbacks)
    recover.push(
      observed(
        "runs",
        verification.green
          ? `${plural(setbacks, "test run")} failed or errored before the first one that passed.`
          : `${plural(setbacks, "test run")} failed or errored; none passed every visible test.`,
        verification.green ? "pass" : "neutral",
      ),
    );
  if (recovery.failedPushes)
    recover.push(
      observed(
        "pushes",
        passing
          ? `CI failed on ${plural(recovery.failedPushes, "push", "pushes")}, then passed.`
          : `CI failed on ${plural(recovery.failedPushes, "push", "pushes")}.`,
        passing ? "pass" : "fail",
      ),
    );
  if (recovery.closedBefore)
    recover.push(
      observed(
        "closed",
        `${plural(recovery.closedBefore, "earlier pull request")} closed without merging.`,
      ),
    );
  const f = recovery.findings;
  if (f.raised) {
    const how = [
      f.byCode && `${f.byCode} by a change to the code`,
      f.byReply && `${f.byReply} by a reply`,
      f.byResolve && `${f.byResolve} resolved by you`,
    ].filter(Boolean);
    recover.push(
      observed(
        "findings",
        `${plural(f.raised, "review finding")}${how.length ? `: ${how.join(", ")}` : ""}${
          f.open ? `; ${f.open} still open` : ""
        }.`,
        f.open ? "fail" : "pass",
      ),
    );
  }
  if (!recover.length)
    recover.push(
      observed(
        "none",
        "Nothing failed along the way, so there was nothing to recover from.",
      ),
    );

  const features = assistance.editorFeatures;
  const typeHelp = features?.some(
    (x) => x === "type-diagnostics" || x === "hover-types",
  );
  // Said only while it is true: the recorded features list every kind of help that was on.
  const completion = features?.some((x) => /complet/.test(x));
  const assist: EvidenceItem[] = [
    observed(
      "hints",
      assistance.hints
        ? `${plural(assistance.hints, "hint")} from a teammate.`
        : "No hints.",
    ),
  ];
  if (assistance.comments)
    assist.push(
      observed(
        "comments",
        `${plural(assistance.comments, "teammate comment")} on the ticket while you worked.`,
      ),
    );
  assist.push(
    features
      ? observed(
          "editor",
          `Editor: syntax highlighting${typeHelp ? `, type errors and hover types (shown ${plural(assistance.typeHelp, "time")})` : ""}${
            features.includes("vim-keybindings") ? ", Vim keys" : ""
          }${completion ? "" : "; no autocomplete"}. No AI or chat.`,
        )
      : missing("editor", "Which editor help was on isn't available."),
  );
  assist.push(
    observed(
      "pastes",
      assistance.pastes
        ? `${plural(assistance.pastes, "paste")} into the code. Where pasted text came from isn't known.`
        : "No pastes into the code.",
    ),
  );

  const time: EvidenceItem[] = [
    observed(
      "active",
      `Active for ${minutes(timing.active)}; ${minutes(timing.elapsed)} from first opening the issue.`,
    ),
    inferred(
      "time-caveat",
      `Time includes reading and waiting for the test runner${
        timing.hidden
          ? `, and the page was in the background ${plural(timing.hidden, "time")}`
          : ""
      }. It says how this went, not how good anyone is.`,
    ),
  ];

  return [
    { id: "changed", title: "What changed", items: [...gaps, ...changed] },
    { id: "correctness", title: "Correctness", items: correctness },
    { id: "regression", title: "Beyond the visible tests", items: regression },
    { id: "verification", title: "Verification", items: verify },
    { id: "recovery", title: "Recovery", items: recover },
    { id: "assistance", title: "Help", items: assist },
    { id: "timing", title: "Time", items: time },
  ];
}

/**
 * What to do before merging an open pull request. With the merge gate's verdict, what stops the
 * merge comes first, then open findings, which are a separate requirement. Without it, only what
 * the facts show: failing checks and open findings.
 */
export function actionsOf(
  facts: EvidenceFacts,
  blocker?: MergeBlocker | null,
): EvidenceAction[] {
  if (facts.state !== "open") return [];
  const out: EvidenceAction[] = [];
  const push = facts.pushes;
  const checks = (): EvidenceAction => ({
    id: "checks",
    where: "ide",
    text:
      facts.checks.result === "checks-failed"
        ? `${facts.checks.total - facts.checks.passed} of ${facts.checks.total} checks fail on push ${push}. Fix them in the IDE and push again.`
        : `CI didn't reach the tests on push ${push}. Fix the error in the IDE and push again.`,
  });
  if (blocker === undefined) {
    if (facts.checks.result !== "checks-passed") out.push(checks());
  } else if (blocker === "checks") out.push(checks());
  else if (blocker === "checks-pending")
    out.push({
      id: "checks-pending",
      where: "wait",
      text: "CI hasn't finished on the latest push. Its result decides whether this can merge.",
    });
  else if (blocker === "code-changed")
    out.push({
      id: "code-changed",
      where: "ide",
      text: `You've changed the code since push ${push}. Push again so CI checks what you have.`,
    });
  else if (blocker === "code-unconfirmed")
    out.push({
      id: "code-unconfirmed",
      where: "ide",
      text: `The code you have now can't be matched to push ${push}. Push again so CI checks what you have.`,
    });
  else if (blocker === "revision")
    out.push({
      id: "revision",
      where: "ide",
      text: `Push ${push} was checked against a different version of the ticket from the one you're working on. Push again to check against it.`,
    });
  if (facts.openRequired)
    out.push({
      id: "review",
      where: "findings",
      text: `${plural(facts.openRequired, "finding")} to resolve under Findings.`,
    });
  return out;
}

export function evidenceOf(input: EvidenceInput): Evidence | null {
  const facts = evidenceFacts(input);
  return (
    facts && {
      facts,
      sections: describe(facts),
      actions: actionsOf(facts, input.blocker),
    }
  );
}

/**
 * The outcome as it may leave this browser, for a share owner to publish: counts and statuses
 * only. Never code, file paths, review or reply text, timing or anything about assistance
 * beyond counts. Version 1.
 */
export interface PublicEvidence {
  readonly v: 1;
  readonly state: "open" | "merged" | "closed";
  /** CI on the latest push. */
  readonly checks: PublicChecks;
  /** CI on the first submitted push (push 1); null when not available. */
  readonly first: PublicChecks | null;
  /** Checks only CI runs; null when unknown. */
  readonly hidden: { readonly passed: number; readonly total: number } | null;
  readonly changed: {
    readonly files: number;
    readonly added: number;
    readonly removed: number;
  } | null;
  readonly pushes: number;
  readonly runs: number;
  readonly testedBeforePush: BeforePush;
  readonly failedPushes: number;
  readonly findings: { readonly raised: number; readonly open: number };
  readonly hints: number;
  /** Activity is missing for part of the work. */
  readonly gaps: boolean;
}

interface PublicChecks {
  readonly passed: number;
  readonly total: number;
  readonly result: PublicResult;
}

type PublicResult =
  | "checks-passed"
  | "checks-failed"
  | "checks-errored"
  | "cancelled";
const RESULTS: readonly PublicResult[] = [
  "checks-passed",
  "checks-failed",
  "checks-errored",
  "cancelled",
];
const BEFORE: readonly BeforePush[] = [
  "tested-passing",
  "tested-failing",
  "changed-after",
  "unknown",
  "none",
];

const publicChecks = (c: {
  passed: number;
  total: number;
  result: string;
}): PublicChecks => ({
  passed: c.passed,
  total: c.total,
  result: RESULTS.includes(c.result as PublicResult)
    ? (c.result as PublicResult)
    : "checks-errored",
});

export function publicEvidence(facts: EvidenceFacts): PublicEvidence {
  const touched = facts.changed?.filter((f) => f.added || f.removed);
  return {
    v: 1,
    state: facts.state,
    checks: publicChecks(facts.checks),
    first: facts.first && publicChecks(facts.first),
    hidden: facts.hidden && {
      passed: facts.hidden.passed,
      total: facts.hidden.total,
    },
    changed: touched
      ? {
          files: touched.length,
          added: touched.reduce((n, f) => n + f.added, 0),
          removed: touched.reduce((n, f) => n + f.removed, 0),
        }
      : null,
    pushes: facts.pushes,
    runs: facts.verification.runs,
    testedBeforePush: facts.verification.beforePush,
    failedPushes: facts.recovery.failedPushes,
    findings: {
      raised: facts.recovery.findings.raised,
      open: facts.recovery.findings.open,
    },
    hints: facts.assistance.hints,
    gaps: facts.gaps > 0,
  };
}

const count = (v: unknown, max = 100_000): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
const pair = (
  v: unknown,
): v is { passed: number; total: number; [key: string]: unknown } =>
  typeof v === "object" &&
  v !== null &&
  count((v as { passed: unknown }).passed) &&
  count((v as { total: unknown }).total) &&
  (v as { passed: number }).passed <= (v as { total: number }).total;

const checksOk = (v: unknown): v is PublicChecks =>
  pair(v) && RESULTS.includes(v.result as PublicResult);

/**
 * Public evidence from untrusted input (a link, a stored share), or null when it is not one
 * `publicEvidence` would have made. Unknown keys are dropped.
 */
export function parsePublicEvidence(value: unknown): PublicEvidence | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const changed = v.changed as Record<string, unknown> | null | undefined;
  const findings = v.findings as Record<string, unknown> | undefined;
  const ok =
    v.v === 1 &&
    (v.state === "open" || v.state === "merged" || v.state === "closed") &&
    checksOk(v.checks) &&
    (v.first === null || checksOk(v.first)) &&
    (v.hidden === null || pair(v.hidden)) &&
    (changed === null ||
      (typeof changed === "object" &&
        count(changed.files) &&
        count(changed.added, 10_000_000) &&
        count(changed.removed, 10_000_000))) &&
    count(v.pushes) &&
    count(v.runs) &&
    BEFORE.includes(v.testedBeforePush as BeforePush) &&
    count(v.failedPushes) &&
    typeof findings === "object" &&
    findings !== null &&
    count(findings.raised) &&
    count(findings.open) &&
    count(v.hints) &&
    typeof v.gaps === "boolean";
  if (!ok) return null;
  const c = v.checks as PublicChecks;
  const f = v.first as PublicChecks | null;
  const h = v.hidden as { passed: number; total: number } | null;
  const ch = changed as {
    files: number;
    added: number;
    removed: number;
  } | null;
  const fi = findings as { raised: number; open: number };
  return {
    v: 1,
    state: v.state as PublicEvidence["state"],
    checks: { passed: c.passed, total: c.total, result: c.result },
    first: f && { passed: f.passed, total: f.total, result: f.result },
    hidden: h && { passed: h.passed, total: h.total },
    changed: ch && { files: ch.files, added: ch.added, removed: ch.removed },
    pushes: v.pushes as number,
    runs: v.runs as number,
    testedBeforePush: v.testedBeforePush as BeforePush,
    failedPushes: v.failedPushes as number,
    findings: { raised: fi.raised, open: fi.open },
    hints: v.hints as number,
    gaps: v.gaps as boolean,
  };
}
