/**
 * The Output panel's view of a run, read like a terminal running the tests: what the code
 * printed, every error with its trace, each case's result and the summary. Pure, so the
 * wording is testable without a browser.
 */
import {
  casesRun,
  type Case,
  type Executable,
} from "../../../../packages/content/model";
import { privateCheckFailure } from "./check-feedback";
import { runFeedback } from "../../../../packages/domain/workspace";
import type { CaseResult, CodeError } from "../../../../packages/runner/runner";
import type { RunView } from "../workspace/session";

export type { Executable };
export type Tone = "out" | "err" | "pass" | "fail" | "dim";
export interface Line {
  text: string;
  tone: Tone;
}

/** How a case reads: the call, or for SQL the rows it starts with. */
export function caseLabel(challenge: Executable, input: unknown): string {
  if (challenge.schema && input && typeof input === "object")
    return Object.entries(input as Record<string, unknown[]>)
      .map(
        ([table, rows]) =>
          `${table}: ${rows.length} row${rows.length === 1 ? "" : "s"}`,
      )
      .join(", ");
  if (challenge.language === "html" && Array.isArray(input))
    return `${input[0]} → ${input[1]}`;
  const args = challenge.parameters ? (input as unknown[]) : [input];
  return `${challenge.entrypoint}(${args.map((arg) => JSON.stringify(arg)).join(", ")})`;
}

const lines = (text: string, tone: Tone, indent = ""): Line[] =>
  text
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => ({ text: indent + line, tone }));

function errorLines(error: CodeError, indent = ""): Line[] {
  const trace = error.traceback.text.trim();
  return lines(trace || `${error.type}: ${error.message}`, "err", indent);
}

function caseLines(
  challenge: Executable,
  check: Case,
  passed: boolean,
  result?: CaseResult,
): Line[] {
  const label = check.visible
    ? (check.name ?? caseLabel(challenge, check.input))
    : "Additional check";
  if (!check.visible)
    return [
      {
        text: `${passed ? "✔" : "✘"} ${label}${passed ? "" : `: ${privateCheckFailure(result)}`}`,
        tone: passed ? "pass" : "fail",
      },
    ];
  if (passed) return [{ text: `✔ ${label}`, tone: "pass" }];
  const out: Line[] = [{ text: `✘ ${label}`, tone: "fail" }];
  if (result?.error) return [...out, ...errorLines(result.error, "    ")];
  if (result?.conversionError)
    return [...out, ...errorLines(result.conversionError, "    ")];
  out.push({
    text: `    expected ${JSON.stringify(check.expected)}`,
    tone: "dim",
  });
  out.push({
    text: `    got      ${result?.repr?.text ?? result?.output?.text ?? "nothing"}${result?.unserializable ? `  (not JSON: ${result.unserializable})` : ""}`,
    tone: "fail",
  });
  return out;
}

/** The toolchain as a developer would name it, without how it runs here ("Go 1.22", not "(Yaegi)"). */
export function toolchain(label: string): string {
  return label.replace(/\s*\(.*\)$/, "");
}

export function transcript(
  run: RunView | null,
  challenge: Executable,
  runtimeLabel: string,
): Line[] {
  if (!run) return [];
  const header: Line = {
    text: `$ ${run.pullRequest ? "submit" : "run tests"} · ${toolchain(runtimeLabel)}`,
    tone: "dim",
  };
  const o = run.outcome;
  if (!o) return [header, { text: "Running…", tone: "dim" }];
  if (o.status === "timeout")
    return [
      header,
      {
        text: `Stopped after ${o.timeoutMs / 1000} s: the run did not finish. Look for a loop that never ends.`,
        tone: "err",
      },
    ];
  if (o.status === "cancelled")
    return [header, { text: "Run cancelled.", tone: "dim" }];
  if (o.status === "runner-error")
    return [
      header,
      {
        text: "The test runner crashed; this wasn't your code. Run the tests again.",
        tone: "err",
      },
    ];
  const out: Line[] = [header];
  const privateCases = casesRun(challenge.cases, run.purpose).some(
    (check) => !check.visible,
  );
  if (privateCases)
    out.push({
      text: "Detailed output is hidden for additional checks. Run the public examples for detailed feedback.",
      tone: "dim",
    });
  if (!privateCases && o.stdout.text) out.push(...lines(o.stdout.text, "out"));
  if (!privateCases && o.stderr.text) out.push(...lines(o.stderr.text, "err"));
  if (!privateCases && (o.stdout.truncated || o.stderr.truncated))
    out.push({
      text: `(output truncated: showing the first 64 KiB of ${o.stdout.bytes + o.stderr.bytes} bytes)`,
      tone: "dim",
    });
  if (o.error && o.phase !== "tests") {
    out.push(...errorLines(o.error));
    out.push({
      text:
        o.phase === "compile"
          ? "The code did not compile; no cases ran."
          : "The code failed before any case ran.",
      tone: "fail",
    });
    return out;
  }
  const cases = casesRun(challenge.cases, run.purpose);
  const feedback = runFeedback(cases, o.cases);
  cases.forEach((check, index) =>
    out.push(
      ...caseLines(challenge, check, feedback.passed[index], o.cases[index]),
    ),
  );
  const failed = feedback.total - feedback.correct;
  out.push({
    text: `${feedback.correct} passed${failed ? `, ${failed} failed` : ""} · ${o.durationMs} ms`,
    tone: failed ? "fail" : "pass",
  });
  return out;
}
