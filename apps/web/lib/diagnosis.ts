/**
 * What a full check shows, case by case. A case in the repo's test file is public: a failure
 * shows its input, the expected value and what the code gave. A case only the full check runs
 * stays hidden: a failure gives its name (the public requirement) and a failure category, never
 * its input, expected value or the code's output, so the check is not an oracle for its answers.
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
  /** The case's name in the tests (the requirement it checks), or "case 3". */
  name: string;
  /** In the repo's test file. */
  visible: boolean;
  passed: boolean;
  /** Failing cases only. `errorType` names a raised error's type, never its message. */
  failure: { category: FailureCategory; errorType: string | null } | null;
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
  /** The code failed before any case ran (a syntax or import error). */
  | {
      kind: "error";
      error: { type: string; message: string };
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

function category(result: CaseResult): NonNullable<CheckRow["failure"]> {
  if (result?.error)
    return { category: "raised", errorType: result.error.type };
  if (result?.output?.truncated)
    return { category: "cut-short", errorType: null };
  if (result?.output) return { category: "wrong-value", errorType: null };
  if (result?.unserializable) return { category: "not-json", errorType: null };
  return { category: "no-result", errorType: null };
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
  if (outcome.phase !== "tests" || !outcome.cases)
    return {
      kind: "error",
      error: {
        type: outcome.error?.type ?? "Error",
        message: outcome.error?.message ?? "the checks didn't reach the tests",
      },
      traceback: outcome.error?.traceback?.text || null,
    };
  const { passed } = runFeedback(cases, outcome.cases);
  const rows = cases.map((c, i): CheckRow => {
    const result = outcome.cases![i];
    return {
      name: c.name ?? `case ${i + 1}`,
      visible: c.visible,
      passed: passed[i],
      failure: passed[i] ? null : category(result),
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
