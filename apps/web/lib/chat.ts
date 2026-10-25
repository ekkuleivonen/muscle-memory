/**
 * The team chat (docs/incident.md): the workplace around the work, as lines a revision carries
 * with what releases each one. What has been said is a pure function of the attempt's own
 * records, so it is the same on every page and every reload, starts again on a replay, and is
 * not recorded separately: it can always be worked out again from the records.
 */
import {
  casesRun,
  type ChatAfter,
  type ChatLine,
  type Revision,
} from "../../../packages/content/model";
import {
  runFeedback,
  type WorkspaceRecord,
} from "../../../packages/domain/workspace";
import { attemptRecords } from "./attempts";

export interface ChatMessage {
  id: string;
  author: string;
  role: string;
  text: string;
  /** When what released it happened. */
  at: string;
}

interface Observation {
  type: string;
  occurredAt: string;
  sequence: number;
  issueRevision: string | null;
  data: Record<string, unknown>;
}

const TERMINAL = new Set([
  "result",
  "user-error",
  "runner-error",
  "timeout",
  "cancelled",
]);

function observationsOf(
  records: readonly WorkspaceRecord[],
  issue: string,
): Observation[] {
  const out: Observation[] = [];
  for (const record of records) {
    if (record.kind !== "observation") continue;
    try {
      const value = JSON.parse(record.payload);
      if (value?.issue !== issue || typeof value.occurredAt !== "string")
        continue;
      out.push({
        type: String(value.type),
        occurredAt: value.occurredAt,
        sequence: Number(value.source?.sequence ?? 0),
        issueRevision:
          typeof value.issueRevision === "string" ? value.issueRevision : null,
        data: value.data ?? {},
      });
    } catch {
      // An unreadable record is not evidence of anything.
    }
  }
  return out.sort(
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) || a.sequence - b.sequence,
  );
}

/** Case id → passed for a finished run, or null if it never reached the cases. */
function casesOf(
  run: Observation,
  revisionFor: (id: string) => Revision | undefined,
): Record<string, boolean> | null {
  const revision = run.issueRevision
    ? revisionFor(run.issueRevision)
    : undefined;
  const outcome = run.data.outcome as
    | {
        phase?: string;
        cases?: { output?: { text: string; truncated: boolean } }[];
      }
    | undefined;
  if (!revision || outcome?.phase !== "tests" || !outcome.cases) return null;
  const purpose =
    run.data.purpose === "pull-request" ? "pull-request" : "local";
  const cases = casesRun(revision.checks.cases, purpose);
  const { passed } = runFeedback(cases, outcome.cases);
  return Object.fromEntries(cases.map((c, i) => [c.id, passed[i]]));
}

/** When the thing a line waits for first happened in these observations, or null. */
function releasedAt(
  after: ChatAfter,
  own: readonly Observation[],
  revisionFor: (id: string) => Revision | undefined,
): string | null {
  const first = (test: (o: Observation) => boolean) =>
    own.find(test)?.occurredAt ?? null;
  if ("start" in after) return own[0]?.occurredAt ?? null;
  if ("opened" in after)
    return first(
      (o) =>
        o.type === "observation.workspace.navigated" &&
        o.data.target === "file" &&
        o.data.via !== "app" &&
        o.data.value === after.opened,
    );
  if ("pullRequest" in after)
    return first((o) => o.type === "observation.workspace.pull-request");
  if ("merged" in after)
    return first(
      (o) =>
        o.type === "observation.board.moved" &&
        o.data.trigger === "pull-request-merged",
    );
  const want = after.is === "passing";
  if ("check" in after) {
    // CI's result arrives with the pull request push that reports it.
    const runs = new Map(
      own
        .filter(
          (o) =>
            o.type === "observation.workspace.run" &&
            TERMINAL.has(String(o.data.status)),
        )
        .map((o) => [String(o.data.runId), o]),
    );
    return first((o) => {
      if (o.type !== "observation.workspace.pull-request") return false;
      const run = runs.get(String(o.data.runId));
      return !!run && casesOf(run, revisionFor)?.[after.check] === want;
    });
  }
  return first((o) => {
    if (
      o.type !== "observation.workspace.run" ||
      !TERMINAL.has(String(o.data.status)) ||
      o.data.purpose === "pull-request"
    )
      return false;
    return casesOf(o, revisionFor)?.[after.ran] === want;
  });
}

/**
 * The chat so far for the attempt under way: the revision's lines whose moment has come, in the
 * order those moments happened (lines released together keep the revision's order).
 */
export function chatOf(
  lines: readonly ChatLine[],
  records: readonly WorkspaceRecord[],
  issue: string,
  revisionFor: (id: string) => Revision | undefined,
): ChatMessage[] {
  const own = observationsOf(attemptRecords(records, issue), issue);
  return lines
    .map((line, index) => ({
      line,
      index,
      at: releasedAt(line.after, own, revisionFor),
    }))
    .filter((m): m is typeof m & { at: string } => m.at !== null)
    .sort((a, b) => a.at.localeCompare(b.at) || a.index - b.index)
    .map(({ line, at }) => ({
      id: line.id,
      author: line.author.name,
      role: line.author.role,
      text: line.text,
      at,
    }));
}
