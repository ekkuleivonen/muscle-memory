/**
 * What a pull request's CI run shows, case by case, for the Checks tab and Findings: what the
 * code did and which requirement it was checked against. It names the failure and never the fix:
 * the expected value is shown only for cases in the repo's test file, which the person already
 * has; a check only CI runs shows its name, input and what the code did, not the answer it wanted.
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
  /** The expected value, for cases in the repo's test file only. */
  expected: { value: Json } | null;
  passed: boolean;
  /** What the code did, when it failed: "returned 3", "raised KeyError: 'x'". */
  observed: string | null;
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

function observed(
  got: NonNullable<RawOutcome["cases"]>[number] | undefined,
): string {
  if (got?.error) return `raised ${got.error.type}: ${got.error.message}`;
  if (got?.output)
    return `returned ${got.output.text}${got.output.truncated ? " (cut short)" : ""}`;
  if (got?.unserializable)
    return `returned a value that isn't JSON (${got.unserializable})`;
  return "returned nothing";
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
      expected: c.visible ? { value: c.expected } : null,
      passed: passed[i],
      observed: passed[i] ? null : observed(outcome.cases![i]),
    }),
  );
  return { kind: "tests", rows, failed: rows.filter((r) => !r.passed) };
}
