/**
 * What a CI run shows, case by case, for the Checks tab and Findings: each failing case as its
 * input, the value it should give and what the code gave instead, so the requirement is plain and
 * the work is in fixing the code, not in decoding the failure. It never suggests code.
 */
import type { Case } from "../../../packages/content/model";
import type { Json } from "../../../packages/domain/json";
import { runFeedback } from "../../../packages/domain/workspace";

/** One case as CI ran it. */
export interface CheckRow {
  /** The case's name in the repo's tests, or "case 3". */
  name: string;
  input: Json;
  /** In the repo's test file. */
  visible: boolean;
  expected: Json;
  passed: boolean;
  /** What the code gave instead, when it failed: `3`, or a raised `KeyError: 'x'`. */
  got: { label: "Got" | "Raised"; text: string } | null;
}

export type Diagnosis =
  /** CI didn't finish the cases: nothing per case to show. */
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

function got(
  result: NonNullable<RawOutcome["cases"]>[number] | undefined,
): NonNullable<CheckRow["got"]> {
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

/** A CI run's outcome against the cases it ran; null when there is no outcome to read. */
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
  const rows = cases.map(
    (c, i): CheckRow => ({
      name: c.name ?? `case ${i + 1}`,
      input: c.input,
      visible: c.visible,
      expected: c.expected,
      passed: passed[i],
      got: passed[i] ? null : got(outcome.cases![i]),
    }),
  );
  return { kind: "tests", rows, failed: rows.filter((r) => !r.passed) };
}
