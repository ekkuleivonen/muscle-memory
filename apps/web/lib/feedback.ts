/**
 * Teammate feedback read from the records this browser stores: which comments and hints were
 * released, review threads on each pull request, and what is due now. Released feedback is
 * only ever derived from recorded observations, and what is due is a pure function of them
 * and the revision's triggers (packages/content/triggers.ts), so everyone gets the same
 * feedback for the same work.
 */
import {
  casesRun,
  type Hint,
  type Revision,
  type TeamComment,
} from "../../../packages/content/model";
import {
  type Behaviour,
} from "../../../packages/content/triggers";
import { runFeedback, type WorkspaceRecord } from "../../../packages/domain/workspace";

interface Observation {
  type: string;
  occurredAt: string;
  sequence: number;
  issueRevision: string;
  data: Record<string, unknown>;
}

const TERMINAL = new Set(["result", "user-error", "runner-error", "timeout", "cancelled"]);
/** What a person does in the IDE, reading included: each makes its minute an active one. */
const ACTIVE = new Set([
  "observation.workspace.edit",
  "observation.workspace.keys",
  "observation.workspace.selection",
  "observation.workspace.scroll",
  "observation.workspace.clipboard",
]);

/** One issue's observations, oldest first, and the code artifacts by id. */
function read(records: readonly WorkspaceRecord[], issue: string) {
  const observations: Observation[] = [];
  const artifacts = new Map<string, Record<string, unknown>>();
  for (const record of records)
    try {
      const value = JSON.parse(record.payload);
      if (record.kind === "artifact") artifacts.set(record.recordId, value);
      else if (value.issue === issue && typeof value.occurredAt === "string")
        observations.push({
          type: String(value.type),
          occurredAt: value.occurredAt,
          sequence: Number(value.source?.sequence ?? 0),
          issueRevision: String(value.issueRevision),
          data: value.data ?? {},
        });
    } catch {
      // A record that cannot be read is not evidence of anything.
    }
  observations.sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.sequence - b.sequence,
  );
  return { observations, artifacts };
}

/** Which of the revision's cases a run passed, by case id; null if it never reached them. */
function casesOf(
  run: Observation | undefined,
  revisionFor: (id: string) => Revision | undefined,
): Record<string, boolean> | null {
  const revision = run && revisionFor(run.issueRevision);
  const outcome = run?.data.outcome as
    | { phase?: string; cases?: { output?: { text: string; truncated: boolean } }[] }
    | undefined;
  if (!revision || outcome?.phase !== "tests" || !outcome.cases) return null;
  // A local run checks the visible cases; a pull request's run checks them all.
  const purpose = run.data.purpose === "pull-request" ? "pull-request" : "local";
  const cases = casesRun(revision.checks.cases, purpose);
  const { passed } = runFeedback(cases, outcome.cases);
  return Object.fromEntries(cases.map((c, i) => [c.id, passed[i]]));
}

export interface Push {
  number: number;
  push: number;
  at: string;
  passed: boolean;
  /** Case id → passed; null when the checks never reached the cases. */
  cases: Record<string, boolean> | null;
  /** Every editable file as pushed; null when the code was not saved. */
  files: Record<string, string> | null;
}

/** Every push to this issue's pull requests, oldest first. */
export function pushesOf(
  records: readonly WorkspaceRecord[],
  issue: string,
  revisionFor: (id: string) => Revision | undefined,
): Push[] {
  const { observations, artifacts } = read(records, issue);
  const runs = new Map<string, Observation>();
  for (const o of observations)
    if (o.type === "observation.workspace.run" && TERMINAL.has(String(o.data.status)))
      runs.set(String(o.data.runId), o);
  return observations
    .filter((o) => o.type === "observation.workspace.pull-request")
    .map((o) => {
      const artifact = artifacts.get(String(o.data.codeArtifactId));
      const files = artifact?.files as Record<string, { text: string }> | undefined;
      return {
        number: Number(o.data.number),
        push: Number(o.data.push),
        at: o.occurredAt,
        passed: o.data.result === "checks-passed",
        cases: casesOf(runs.get(String(o.data.runId)), revisionFor),
        files: files
          ? Object.fromEntries(Object.entries(files).map(([p, f]) => [p, f.text]))
          : null,
      };
    });
}

/**
 * Behaviour since the last progress: a run or push that passed a larger share of the cases it
 * ran than any before (a local run runs fewer cases than CI). Active minutes are distinct
 * minutes in which the person typed, edited, ran, moved the cursor, scrolled, copied or opened
 * something, so reading counts and a break never does.
 */
export function behaviourOf(
  records: readonly WorkspaceRecord[],
  issue: string,
  revisionFor: (id: string) => Revision | undefined,
): Behaviour {
  const { observations } = read(records, issue);
  let best = 0;
  let since = "";
  let failingPushes = 0;
  for (const o of observations) {
    if (o.type === "observation.workspace.pull-request" && o.data.result !== "checks-passed")
      failingPushes++;
    if (o.type !== "observation.workspace.run" || !TERMINAL.has(String(o.data.status)))
      continue;
    const cases = casesOf(o, revisionFor);
    const results = cases ? Object.values(cases) : [];
    const passed = results.length ? results.filter(Boolean).length / results.length : 0;
    if (passed > best) {
      best = passed;
      since = o.occurredAt;
    }
  }
  const minutes = new Set<number>();
  let runs = 0;
  for (const o of observations) {
    if (o.occurredAt <= since) continue;
    const run = o.type === "observation.workspace.run" && TERMINAL.has(String(o.data.status));
    if (run && o.data.purpose !== "pull-request") runs++;
    if (run || ACTIVE.has(o.type) || (o.type === "observation.workspace.navigated" && o.data.via !== "app"))
      minutes.add(Math.floor(Date.parse(o.occurredAt) / 60000));
  }
  return {
    activeMinutesWithoutProgress: minutes.size,
    runsWithoutProgress: runs,
    failingPushes,
  };
}

/**
 * What the person has looked into: the repo files they opened themselves (navigated by pointer
 * or keyboard, not the IDE opening its default tabs), and the cases of their latest local run.
 */
export function investigationOf(
  records: readonly WorkspaceRecord[],
  issue: string,
  revisionFor: (id: string) => Revision | undefined,
): { opened: string[]; ran: Record<string, boolean> | null } {
  const { observations } = read(records, issue);
  const opened = new Set<string>();
  let ran: Record<string, boolean> | null = null;
  for (const o of observations) {
    if (
      o.type === "observation.workspace.navigated" &&
      o.data.target === "file" &&
      o.data.via !== "app" &&
      (o.data.action === "open" || o.data.action === "show")
    )
      opened.add(String(o.data.value));
    if (
      o.type === "observation.workspace.run" &&
      o.data.purpose !== "pull-request" &&
      TERMINAL.has(String(o.data.status))
    )
      ran = casesOf(o, revisionFor);
  }
  return { opened: [...opened], ran };
}

/** A review comment on a pull request, and what happened to it since. */
export interface Thread {
  comment: string;
  /** The revision whose comment this is: the text, author and severity are read from it. */
  issueRevision: string;
  severity: "blocking" | "nit" | "info";
  wording: number;
  number: number;
  push: number;
  at: string;
  replies: { at: string; text: string }[];
  /**
   * Set once resolved: by a push that no longer triggers it, by a reply, or by the person
   * resolving it (Resolve). None of these touches CI; a while-true finding the code still
   * triggers opens again on the next push.
   */
  resolved?: { at: string; by: "code" | "reply" | "resolve"; push?: number };
}

/** Issue comments and hints released into the issue's thread, oldest first. */
export type Released =
  | {
      kind: "comment";
      comment: string;
      issueRevision: string;
      wording: number;
      at: string;
    }
  | { kind: "hint"; hint: string; level: number; issueRevision: string; at: string };

export interface Feedback {
  released: Released[];
  threads: Thread[];
}

/** A CI finding's thread: opened by the failing push it names. */
function isCiFinding(comment: string): boolean {
  return /^ci-push-\d+$/.test(comment);
}

/**
 * Released feedback and review threads. With `revisionFor`, a finding whose comment needs an
 * explicit Resolve (TeamComment.resolve) is cleared by Resolve only, never by a push or a reply.
 */
export function feedbackOf(
  records: readonly WorkspaceRecord[],
  issue: string,
  revisionFor?: (id: string) => Revision | undefined,
): Feedback {
  const { observations } = read(records, issue);
  const explicit = (thread: Thread) =>
    revisionFor?.(thread.issueRevision)?.team.find((c) => c.id === thread.comment)
      ?.resolve === "explicit";
  const released: Released[] = [];
  const threads: Thread[] = [];
  // The latest thread for a comment on a pull request: where resolutions and replies go.
  const latest = (number: number, comment: string) =>
    threads.findLast((t) => t.number === number && t.comment === comment);
  for (const o of observations) {
    const d = o.data;
    // CI findings (Revision.ciFindings): a failing push opens one unless one is already open.
    if (
      o.type === "observation.workspace.pull-request" &&
      d.result !== "checks-passed" &&
      revisionFor?.(o.issueRevision)?.ciFindings === "explicit"
    ) {
      const number = Number(d.number);
      const open = threads.findLast(
        (t) => t.number === number && isCiFinding(t.comment) && !t.resolved,
      );
      if (!open)
        threads.push({
          comment: `ci-push-${Number(d.push)}`,
          issueRevision: o.issueRevision,
          severity: "blocking",
          wording: 0,
          number,
          push: Number(d.push),
          at: o.occurredAt,
          replies: [],
        });
      continue;
    }
    if (o.type === "observation.workspace.comment" && d.where === "review")
      threads.push({
        comment: String(d.comment),
        issueRevision: o.issueRevision,
        severity: d.severity as Thread["severity"],
        wording: Number(d.wording),
        number: Number(d.pullRequest),
        push: Number(d.push),
        at: o.occurredAt,
        replies: [],
      });
    else if (o.type === "observation.workspace.comment")
      released.push({
        kind: "comment",
        comment: String(d.comment),
        issueRevision: o.issueRevision,
        wording: Number(d.wording),
        at: o.occurredAt,
      });
    else if (o.type === "observation.workspace.hint")
      released.push({
        kind: "hint",
        hint: String(d.hint),
        level: Number(d.level),
        issueRevision: o.issueRevision,
        at: o.occurredAt,
      });
    else if (o.type === "observation.workspace.thread-resolved") {
      const thread = latest(Number(d.pullRequest), String(d.comment));
      if (thread && !thread.resolved && !explicit(thread))
        thread.resolved = { at: o.occurredAt, by: "code", push: Number(d.push) };
    } else if (o.type === "observation.board.resolved") {
      const thread = latest(Number(d.pullRequest), String(d.comment));
      if (thread && !thread.resolved) thread.resolved = { at: o.occurredAt, by: "resolve" };
    } else if (o.type === "observation.board.replied") {
      const thread = latest(Number(d.pullRequest), String(d.comment));
      if (!thread) continue;
      thread.replies.push({ at: o.occurredAt, text: String(d.text) });
      if (thread.severity === "blocking" && !thread.resolved && !explicit(thread))
        thread.resolved = { at: o.occurredAt, by: "reply" };
    }
  }
  return { released, threads };
}

/**
 * Open threads that must be resolved before merging: blocking ones, plus any whose comment
 * needs an explicit Resolve (TeamComment.resolve), whatever its severity. Without explicit
 * comments this is exactly openBlocking.
 */
export function openRequired(
  feedback: Feedback,
  number: number,
  revisionFor: (id: string) => Revision | undefined,
): Thread[] {
  return feedback.threads.filter(
    (t) =>
      t.number === number &&
      !t.resolved &&
      (t.severity === "blocking" ||
        revisionFor(t.issueRevision)?.team.find((c) => c.id === t.comment)?.resolve ===
          "explicit"),
  );
}

/** Comments on the `opened` event are the ticket's own thread: shown, never released. */
export function inTicket(comment: TeamComment): boolean {
  return (
    comment.where === "issue" &&
    "event" in comment.when &&
    comment.when.event === "opened"
  );
}

export type Release =
  | { kind: "comment"; comment: TeamComment; wording: number; pullRequest?: number; push?: number }
  | { kind: "hint"; hint: Hint }
  | { kind: "resolved"; comment: string; pullRequest: number; push: number };
