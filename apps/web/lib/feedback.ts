/**
 * Teammate feedback read from the records this browser stores: which comments and hints were
 * released, review threads on each pull request, and what is due now. Released feedback is
 * only ever derived from recorded observations, and what is due is a pure function of them
 * and the revision's triggers (packages/content/triggers.ts), so everyone gets the same
 * feedback for the same work.
 */
import {
  casesRun,
  type Revision,
  type TeamComment,
} from "../../../packages/content/model";
import { type Behaviour } from "../../../packages/content/triggers";
import {
  runFeedback,
  type WorkspaceRecord,
} from "../../../packages/domain/workspace";

interface Observation {
  type: string;
  occurredAt: string;
  sequence: number;
  issueRevision: string;
  data: Record<string, unknown>;
}

const TERMINAL = new Set([
  "result",
  "user-error",
  "runner-error",
  "timeout",
  "cancelled",
]);
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
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) || a.sequence - b.sequence,
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
    | {
        phase?: string;
        cases?: { output?: { text: string; truncated: boolean } }[];
      }
    | undefined;
  if (!revision || outcome?.phase !== "tests" || !outcome.cases) return null;
  // A local run checks the visible cases; a pull request's run checks them all.
  const purpose =
    run.data.purpose === "pull-request" ? "pull-request" : "local";
  const cases = casesRun(revision.checks.cases, purpose);
  const { passed } = runFeedback(cases, outcome.cases);
  return Object.fromEntries(cases.map((c, i) => [c.id, passed[i]]));
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
    if (
      o.type === "observation.workspace.pull-request" &&
      o.data.result !== "checks-passed"
    )
      failingPushes++;
    if (
      o.type !== "observation.workspace.run" ||
      !TERMINAL.has(String(o.data.status))
    )
      continue;
    const cases = casesOf(o, revisionFor);
    const results = cases ? Object.values(cases) : [];
    const passed = results.length
      ? results.filter(Boolean).length / results.length
      : 0;
    if (passed > best) {
      best = passed;
      since = o.occurredAt;
    }
  }
  const minutes = new Set<number>();
  let runs = 0;
  for (const o of observations) {
    if (o.occurredAt <= since) continue;
    const run =
      o.type === "observation.workspace.run" &&
      TERMINAL.has(String(o.data.status));
    if (run && o.data.purpose !== "pull-request") runs++;
    if (
      run ||
      ACTIVE.has(o.type) ||
      (o.type === "observation.workspace.navigated" && o.data.via !== "app")
    )
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

/** Comments on the `opened` event are the ticket's own thread: shown, never released. */
export function inTicket(comment: TeamComment): boolean {
  return (
    comment.where === "issue" &&
    "event" in comment.when &&
    comment.when.event === "opened"
  );
}
