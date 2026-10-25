/**
 * What the practice area says about the latest full check, read from the one gate that decides
 * completion (lib/merge.ts `mergeEligibility`), so feedback and completion never disagree. One
 * headline and at most one next step; failing cases come from lib/diagnosis.ts (public cases in
 * full, hidden ones by name and failure category). Edited, stale, pending and failing states
 * never read as done. No pull request vocabulary: this is the challenge's own check.
 */
import type { Diagnosis } from "./diagnosis";
import type { MergeBlocker } from "./merge";

export type CheckState =
  | "unchecked"
  | "running"
  | "failing"
  | "edited"
  | "unconfirmed"
  | "revision"
  | "required"
  | "passed"
  | "completed";

/**
 * A deterministic correctness or safety rule the checked code still triggers: it blocks until the
 * code changes. Shown as the requirement it enforces, with no teammate and no Resolve.
 */
export interface RequiredRule {
  id: string;
  /** Markdown: the requirement, as the challenge states it. */
  text: string;
}

export interface CheckFeedback {
  state: CheckState;
  tone: "neutral" | "busy" | "fail" | "pass";
  headline: string;
  /** What to do next, when there is something to do. */
  next: string | null;
  /** Failing cases, when the check failed. */
  diagnosis: Diagnosis | null;
  /** Rules still triggered, when every case passed. */
  required: RequiredRule[];
}

export interface CheckFeedbackInput {
  /**
   * The gate's verdict for the latest check: null when it can complete, undefined when nothing
   * was checked yet in this attempt.
   */
  blocker: MergeBlocker | null | undefined;
  /** A full check is running now in this page. */
  running: boolean;
  /** The latest check's counts, when one was recorded. */
  latest: { passed: number; total: number } | null;
  /** The latest check's failing cases (lib/diagnosis `diagnose`). */
  diagnosis: Diagnosis | null;
  required: readonly RequiredRule[];
}

const cases = (n: number) => `${n} ${n === 1 ? "case" : "cases"}`;
const CHECK_AGAIN = "Check your code again.";

export function checkFeedbackOf(input: CheckFeedbackInput): CheckFeedback {
  const { blocker, running, latest, diagnosis } = input;
  const base = { diagnosis: null, required: [] as RequiredRule[], next: null };
  if (running || blocker === "checks-pending")
    return {
      ...base,
      state: "running",
      tone: "busy",
      headline: "Checking your code against every case…",
    };
  if (blocker === undefined || !latest)
    return {
      ...base,
      state: "unchecked",
      tone: "neutral",
      headline: "Not checked yet.",
      next: "Check your code to run every case, including hidden ones.",
    };
  if (blocker === "not-open" || blocker === "other-merged")
    return { ...base, state: "completed", tone: "pass", headline: "Done." };
  if (blocker === "checks") {
    const headline =
      diagnosis?.kind === "tests"
        ? `${diagnosis.failed.length} of ${cases(diagnosis.rows.length)} failed.`
        : diagnosis?.kind === "error"
          ? "Your code failed before any case ran."
          : diagnosis?.kind === "stopped"
            ? diagnosis.reason === "timeout"
              ? "The check timed out before every case finished. Look for a loop that never ends."
              : diagnosis.reason === "runner-error"
                ? "The test runner crashed; this wasn't your code."
                : "The check was cancelled."
            : `${latest.total - latest.passed} of ${latest.total} cases failed.`;
    return {
      ...base,
      state: "failing",
      tone: "fail",
      headline,
      diagnosis,
      next:
        diagnosis?.kind === "stopped" && diagnosis.reason !== "timeout"
          ? CHECK_AGAIN
          : "Fix the code, then check again.",
    };
  }
  if (blocker === "code-changed")
    return {
      ...base,
      state: "edited",
      tone: "neutral",
      headline: "You've edited the code since the last check.",
      next: CHECK_AGAIN,
    };
  if (blocker === "code-unconfirmed")
    return {
      ...base,
      state: "unconfirmed",
      tone: "neutral",
      headline: "Your saved code can't be matched to the last check.",
      next: CHECK_AGAIN,
    };
  if (blocker === "revision")
    return {
      ...base,
      state: "revision",
      tone: "neutral",
      headline: "The challenge changed after your last check.",
      next: "Check your code against the current version.",
    };
  if (blocker === "review")
    return {
      ...base,
      state: "required",
      tone: "fail",
      headline: `All ${cases(latest.total)} pass, but ${
        input.required.length === 1
          ? "a required rule still applies"
          : "required rules still apply"
      }.`,
      required: [...input.required],
      next: "Change the code so it no longer does this, then check again.",
    };
  return {
    ...base,
    state: "passed",
    tone: "pass",
    headline: `All ${cases(latest.total)} pass.`,
  };
}
