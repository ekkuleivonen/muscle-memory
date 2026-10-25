/**
 * What a full check shows, case by case. A case in the repo's test file is public: a failure
 * shows its input, the expected value and what the code gave. A case only the full check runs
 * stays hidden: a failure gives its position and a failure category, never its name (names can
 * state the answer), input, expected value, the code's output or an error message, so the check
 * is not an oracle for its answers.
 * It never suggests code.
 */
import type { Case } from "../../../packages/content/model";
import type { Json } from "../../../packages/domain/json";
import { runFeedback } from "../../../packages/domain/workspace";

/** How a case failed, said the same way for public and hidden cases. */
export type FailureCategory =
  /** Returned a value, not the expected one. */
  | "wrong-value"
  /** Raised an error. */
  | "raised"
  /** Returned something that can't be compared (not JSON). */
  | "not-json"
  /** The output was too long to compare in full. */
  | "cut-short"
  /** No result came back for the case. */
  | "no-result";

export interface CheckRow {
  /** A public case's name in the tests, or "case 3"; a hidden case is "hidden case 3". */
  name: string;
  /** In the repo's test file. */
  visible: boolean;
  passed: boolean;
  /**
   * Failing cases only: the category alone. Never an error's type or message. User code can set
   * either from its input, so neither is safe for a hidden case; a public case's `detail` has them.
   */
  failure: { category: FailureCategory } | null;
  /** Public cases only: the case as the test file has it, and what the code gave when it failed. */
  detail: {
    input: Json;
    expected: Json;
    got: { label: "Got" | "Raised"; text: string } | null;
  } | null;
}

export type Diagnosis =
  /** The check didn't finish the cases: nothing per case to show. */
  | {
      kind: "stopped";
      reason: "timeout" | "runner-error" | "cancelled";
      timeoutMs: number | null;
    }
  /**
   * The checks did not complete. `stage` is what the runner recorded (compile, or the code's own
   * start-up), never inferred. `error` and `traceback` are null when the run includes hidden cases:
   * user code writes them and can read the hidden inputs while it runs.
   */
  | {
      kind: "error";
      stage: "compile" | "runtime";
      error: { type: string; message: string } | null;
      traceback: string | null;
    }
  | { kind: "tests"; rows: CheckRow[]; failed: CheckRow[] };

interface RawOutcome {
  status?: string;
  phase?: string;
  error?: { type: string; message: string; traceback?: { text: string } };
  cases?: {
    output?: { text: string; truncated: boolean };
    error?: { type: string; message: string };
    unserializable?: string;
  }[];
  timeoutMs?: number;
}

type CaseResult = NonNullable<RawOutcome["cases"]>[number] | undefined;

/**
 * How a case failed, from a stored outcome's case or a live runner result (which may also have
 * `repr` and `conversionError`). Safe for hidden cases: it carries no value and no message.
 */
export function failureOf(
  result:
    | {
        output?: { truncated: boolean };
        repr?: unknown;
        error?: unknown;
        conversionError?: unknown;
        unserializable?: string;
      }
    | undefined,
): NonNullable<CheckRow["failure"]> {
  if (result?.error) return { category: "raised" };
  if (result?.conversionError || result?.unserializable)
    return { category: "not-json" };
  if (result?.output?.truncated) return { category: "cut-short" };
  if (result?.output || result?.repr) return { category: "wrong-value" };
  return { category: "no-result" };
}

const FAILURE: Record<FailureCategory, string> = {
  "wrong-value": "Returned a different value from the one expected.",
  raised: "Raised an error.",
  "not-json": "Returned a value that can't be compared.",
  "cut-short": "Returned output too long to compare.",
  "no-result": "Returned nothing.",
};

/** How a case failed, in words: all a hidden case shows. */
export function failureText(failure: NonNullable<CheckRow["failure"]>): string {
  return FAILURE[failure.category];
}

/**
 * A hidden case's label: "hidden case 3", by position only. Not the call with its arguments,
 * which shows the input, and not its name either: some names state the input and the answer
 * ("guest at exactly $50: free shipping").
 */
export function hiddenLabel(index: number): string {
  return `hidden case ${index + 1}`;
}

function got(
  result: CaseResult,
): NonNullable<NonNullable<CheckRow["detail"]>["got"]> {
  if (result?.error)
    return {
      label: "Raised",
      text: `${result.error.type}: ${result.error.message}`,
    };
  if (result?.output)
    return {
      label: "Got",
      text: `${result.output.text}${result.output.truncated ? " (cut short)" : ""}`,
    };
  if (result?.unserializable)
    return {
      label: "Got",
      text: `a value that isn't JSON (${result.unserializable})`,
    };
  return { label: "Got", text: "nothing" };
}

/** A full check's outcome against the cases it ran; null when there is no outcome to read. */
export function diagnose(
  raw: unknown,
  cases: readonly Case[] | undefined,
): Diagnosis | null {
  const outcome = raw as RawOutcome | null;
  if (!outcome || !cases) return null;
  if (
    outcome.status === "timeout" ||
    outcome.status === "runner-error" ||
    outcome.status === "cancelled"
  )
    return {
      kind: "stopped",
      reason: outcome.status,
      timeoutMs:
        typeof outcome.timeoutMs === "number" ? outcome.timeoutMs : null,
    };
  if (outcome.phase !== "tests" || !outcome.cases) {
    // A run with hidden cases shows no user-written text: module code can read the inputs
    // (Python's harness has them before the code is even loaded) and put them in an error.
    const shown = cases.every((c) => c.visible) && outcome.error;
    return {
      kind: "error",
      stage: outcome.phase === "compile" ? "compile" : "runtime",
      error: shown
        ? { type: outcome.error!.type, message: outcome.error!.message }
        : null,
      traceback: shown ? outcome.error!.traceback?.text || null : null,
    };
  }
  const { passed } = runFeedback(cases, outcome.cases);
  const rows = cases.map((c, i): CheckRow => {
    const result = outcome.cases![i];
    return {
      name: c.visible ? (c.name ?? `case ${i + 1}`) : hiddenLabel(i),
      visible: c.visible,
      passed: passed[i],
      failure: passed[i] ? null : failureOf(result),
      detail: c.visible
        ? {
            input: c.input,
            expected: c.expected,
            got: passed[i] ? null : got(result),
          }
        : null,
    };
  });
  return { kind: "tests", rows, failed: rows.filter((r) => !r.passed) };
}
