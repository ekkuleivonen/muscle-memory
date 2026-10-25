/**
 * What practice says about the latest submission, read from its verdict (lib/submission.ts), so
 * feedback and completion never disagree. One headline and at most one next step; failing cases
 * come from lib/diagnosis.ts (examples in full, hidden cases by position and failure category).
 * Edited, running and failing states never read as done.
 */
import type { Diagnosis } from "./diagnosis";
import type { Verdict } from "./submission";

export type CheckState =
  | "unchecked"
  | "running"
  | "failing"
  | "edited"
  | "required"
  | "completed";

/** A rule the submitted code fires: it holds until the code changes. */
export interface RequiredRule {
  id: string;
  /** Markdown: what to change, as the challenge states it. */
  text: string;
}

export interface CheckFeedback {
  state: CheckState;
  tone: "neutral" | "busy" | "fail" | "pass";
  headline: string;
  /** What to do next, when there is something to do. */
  next: string | null;
  /** Failing cases, when the submission failed. */
  diagnosis: Diagnosis | null;
  /** Rules fired, when every case passed. */
  required: RequiredRule[];
}

export interface CheckFeedbackInput {
  /** A submission is running now in this page. */
  running: boolean;
  /** The attempt is completed: its completion is recorded. */
  completed: boolean;
  /** The code changed since the latest submission. */
  edited: boolean;
  /** The latest submission's verdict in this attempt, or null before the first. */
  verdict: Verdict | null;
  /** The latest submission's failing cases (lib/diagnosis `diagnose`). */
  diagnosis: Diagnosis | null;
}

const cases = (n: number) => `${n} ${n === 1 ? "case" : "cases"}`;
const AGAIN = "Submit again.";

export function checkFeedbackOf(input: CheckFeedbackInput): CheckFeedback {
  const { verdict, diagnosis } = input;
  const base = { diagnosis: null, required: [] as RequiredRule[], next: null };
  if (input.completed) return { ...base, state: "completed", tone: "pass", headline: "Done." };
  if (input.running)
    return {
      ...base,
      state: "running",
      tone: "busy",
      headline: "Checking your code against every case…",
    };
  if (!verdict)
    return {
      ...base,
      state: "unchecked",
      tone: "neutral",
      headline: "Not submitted yet.",
      next: "Submit to run every case, including hidden ones.",
    };
  if (input.edited)
    return {
      ...base,
      state: "edited",
      tone: "neutral",
      headline: "You've edited the code since the last submission.",
      next: AGAIN,
    };
  if (verdict.result !== "passed") {
    const headline =
      diagnosis?.kind === "tests"
        ? `${diagnosis.failed.length} of ${cases(diagnosis.rows.length)} failed.`
        : diagnosis?.kind === "error"
          ? diagnosis.stage === "compile"
            ? "Your code didn't compile."
            : "The checks did not complete."
          : diagnosis?.kind === "stopped"
            ? diagnosis.reason === "timeout"
              ? "The check timed out before every case finished. Look for a loop that never ends."
              : diagnosis.reason === "runner-error"
                ? "The test runner crashed; this wasn't your code."
                : "The check was cancelled."
            : `${verdict.total - verdict.passed} of ${verdict.total} cases failed.`;
    return {
      ...base,
      state: "failing",
      tone: "fail",
      headline,
      diagnosis,
      next:
        diagnosis?.kind === "stopped" && diagnosis.reason !== "timeout"
          ? AGAIN
          : "Fix the code, then submit again.",
    };
  }
  return {
    ...base,
    state: "required",
    tone: "fail",
    headline: `All ${cases(verdict.total)} pass, but ${
      verdict.rules.length === 1 ? "a rule still applies" : "rules still apply"
    }.`,
    required: verdict.rules.map((rule) => ({ id: rule.id, text: rule.message })),
    next: "Change the code so it no longer does this, then submit again.",
  };
}
