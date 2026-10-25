/** Exact-code completion gate. Legacy merge/Resolve history is never reinterpreted. */
import { editableFiles, type Revision } from "../../../packages/content/model";
import { evaluate } from "../../../packages/content/triggers";
import {
  runFeedback,
  type WorkspaceRecord,
} from "../../../packages/domain/workspace";
import { validateBoardMoveData } from "../../../packages/domain/board";
import { attemptRecords } from "./attempts";
import { behaviourOf, investigationOf } from "./feedback";
import { mergeEligibility, type MergeEligibility } from "./merge";
import { allPullRequests } from "./pulls";
import type { RequiredRule } from "./check-feedback";

export function completions(
  records: readonly WorkspaceRecord[],
  issue?: string,
) {
  return records
    .flatMap((record) => {
      if (record.kind !== "observation") return [];
      try {
        const v = JSON.parse(record.payload);
        if (
          v.type !== "observation.board.moved" ||
          v.data?.to !== "done" ||
          !["checks-passed", "pull-request-merged"].includes(v.data.trigger) ||
          (issue && v.issue !== issue)
        )
          return [];
        if (
          v.data.trigger === "checks-passed" &&
          v.captureVersion !== "board-capture-7.2.0"
        )
          return [];
        if (v.data.trigger === "checks-passed") {
          validateBoardMoveData(v.data);
          if (
            typeof v.issue !== "string" ||
            !v.issue ||
            !/^sha256:[0-9a-f]{64}$/.test(v.issueRevision)
          )
            return [];
        }
        return [
          {
            issue: String(v.issue),
            revision: String(v.issueRevision),
            key: String(v.data.issueKey),
            at: String(v.occurredAt),
            runId: String(v.data.runId),
            number: Number(v.data.pullRequest),
            automatic: v.data.trigger === "checks-passed",
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

export interface CompletionGate extends MergeEligibility {
  required: RequiredRule[];
  /** Submit gesture taken from the recorded full run, never an automatic click. */
  via: "pointer" | "keyboard" | null;
  completedAt: string | null;
  /** A real completion exists in this attempt; current verification is checked separately. */
  completedInAttempt: boolean;
}

export function completionEligibility(input: {
  records: readonly WorkspaceRecord[];
  issue: string;
  revision: string;
  revisionFor: (id: string) => Revision | undefined;
  currentFiles?: Readonly<Record<string, string>>;
}): CompletionGate {
  const own = attemptRecords(input.records, input.issue);
  const pull = allPullRequests(own).find((p) => p.issue === input.issue);
  const prior = completions(own, input.issue).at(-1);
  const base = {
    required: [] as RequiredRule[],
    via: null,
    completedAt: prior?.at ?? null,
    completedInAttempt: !!prior,
  };
  if (!pull) return { ...base, latest: null, blocker: "checks-pending" };
  // Actual legacy merge history stays in its own reader; verification can still be checked.
  const gate = mergeEligibility({
    records: own,
    issue: input.issue,
    number: pull.number,
    pull: { ...pull, state: "open", otherMerged: undefined },
    published: (id) => !!input.revisionFor(id),
    openRequired: 0,
  });
  const fail = (blocker: CompletionGate["blocker"]): CompletionGate => ({
    ...gate,
    ...base,
    blocker,
  });
  if (!gate.latest) return fail(gate.blocker);
  // A past completion remains history, not evidence that this different run/revision completed.
  base.completedAt =
    prior?.revision === input.revision && prior.runId === gate.latest.runId
      ? prior.at
      : null;
  if (gate.latest.issueRevision !== input.revision) return fail("revision");
  const revision = input.revisionFor(input.revision);
  if (!revision) return fail("revision");
  let artifact: Record<string, { text: string }> | null = null;
  try {
    const a = own.find(
      (r) =>
        r.kind === "artifact" && r.recordId === gate.latest!.codeArtifactId,
    );
    const value = a && JSON.parse(a.payload);
    if (value && !value.truncated) artifact = value.files;
  } catch {
    /* Unconfirmed. */
  }
  if (!artifact) return fail("code-unconfirmed");
  const paths = Object.keys(editableFiles(revision.workspace));
  if (
    Object.keys(artifact).length !== paths.length ||
    paths.some((p) => typeof artifact![p]?.text !== "string")
  )
    return fail("code-unconfirmed");
  if (
    input.currentFiles &&
    (Object.keys(input.currentFiles).length !== paths.length ||
      paths.some((p) => input.currentFiles![p] !== artifact![p].text))
  )
    return fail("code-changed");
  const runs = own.flatMap((r) => {
    try {
      const v = JSON.parse(r.payload);
      return v.type === "observation.workspace.run" &&
        v.data?.runId === gate.latest!.runId
        ? [v]
        : [];
    } catch {
      return [];
    }
  });
  // Same-millisecond starts still count. Different source streams cannot be ordered by
  // sequence, so an unreported concurrent full run conservatively blocks completion.
  const started = runs.find((r) => r.data.status === "queued") ?? runs[0];
  if (started) {
    const reported = new Set(
      own.flatMap((r) => {
        try {
          const v = JSON.parse(r.payload);
          return v.type === "observation.workspace.pull-request"
            ? [v.data.runId]
            : [];
        } catch {
          return [];
        }
      }),
    );
    const pending = own.some((r) => {
      try {
        const v = JSON.parse(r.payload);
        return (
          v.type === "observation.workspace.run" &&
          v.data.purpose === "pull-request" &&
          !reported.has(v.data.runId) &&
          (v.occurredAt > started.occurredAt ||
            (v.occurredAt === started.occurredAt &&
              (v.source?.id !== started.source?.id ||
                v.source?.sequence > started.source?.sequence)))
        );
      } catch {
        return false;
      }
    });
    if (pending) return fail("checks-pending");
  }
  const run = runs.findLast((r) => r.data.outcome);
  const via =
    run?.data.via === "keyboard" || run?.data.via === "pointer"
      ? (run.data.via as "keyboard" | "pointer")
      : null;
  if (gate.blocker) return { ...fail(gate.blocker), via };
  if (
    !run ||
    run.issueRevision !== input.revision ||
    run.data.purpose !== "pull-request" ||
    run.data.codeArtifactId !== gate.latest.codeArtifactId ||
    !via
  )
    return fail("code-unconfirmed");
  const outcome = run.data.outcome;
  const checks = revision.checks.cases;
  const cases = Array.isArray(outcome.cases) ? outcome.cases : [];
  const result = runFeedback(checks, cases);
  if (
    outcome.status !== "completed" ||
    outcome.phase !== "tests" ||
    !Array.isArray(outcome.cases) ||
    cases.length !== checks.length ||
    cases.some(
      (
        c: {
          index: number;
          error?: unknown;
          conversionError?: unknown;
          unserializable?: unknown;
        },
        index: number,
      ) =>
        c.index !== index || c.error || c.conversionError || c.unserializable,
    ) ||
    result.correct !== checks.length ||
    gate.latest.total !== checks.length ||
    gate.latest.passed !== checks.length
  )
    return { ...fail("checks"), via };
  const files = Object.fromEntries(paths.map((p) => [p, artifact![p].text]));
  const { opened, ran } = investigationOf(own, input.issue, input.revisionFor);
  const facts = {
    files,
    cases: Object.fromEntries(checks.map((c) => [c.id, true])),
    ran: ran ?? undefined,
    opened,
    event: (gate.latest.push === 1 ? "pull-request" : "push") as
      | "pull-request"
      | "push",
    behaviour: behaviourOf(own, input.issue, input.revisionFor),
  };
  // Blocking authored rules remain required, irrespective of an old Resolve/reply observation.
  const required = revision.team
    .filter(
      (rule) => rule.severity === "blocking" && evaluate(rule.when, facts),
    )
    .map((rule) => ({
      id: rule.id,
      text: rule.text[0],
    }));
  return {
    ...gate,
    ...base,
    via,
    required,
    blocker: required.length ? "review" : null,
  };
}
