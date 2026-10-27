/**
 * What a model is shown, as text: what practice shows a person, and nothing else. The challenge
 * pane and the starting code on opening; after an edit the code (a person always sees the
 * editor) and the type errors the editor shows; after a run the Output panel (transcript.ts),
 * and after a Submit the feedback above it (lib/check-feedback.ts). Hidden cases appear only
 * as practice shows them: by position and failure category.
 */
import { casesRun, type ChallengeMetadata, type Revision } from "../../packages/content/model";
import { checkFeedbackOf } from "../../apps/web/lib/check-feedback";
import { diagnose } from "../../apps/web/lib/diagnosis";
import { transcript, toolchain } from "../../apps/web/app/practice/transcript";
import type { TypeDiagnostic } from "../../apps/web/app/practice/type-checker";
import type { Edited, Ran } from "./page";

/** A value on one line when it fits, indented JSON when not: as the examples pane shows it. */
function compactJson(value: unknown): string {
  const flat = JSON.stringify(value);
  return flat.length <= 40 ? flat : JSON.stringify(value, null, 2);
}

/** The code as the editor shows it: numbered lines. */
export function numbered(code: string): string {
  const lines = code.split("\n");
  const width = String(lines.length).length;
  return lines.map((line, i) => `${String(i + 1).padStart(width)} | ${line}`).join("\n");
}

/** Line and column (from 1) of an offset. */
function place(code: string, offset: number): string {
  const before = code.slice(0, offset).split("\n");
  return `line ${before.length}, column ${before[before.length - 1].length + 1}`;
}

/** The challenge pane, the editor and the feedback pane as practice opens. */
export function opening(
  metadata: ChallengeMetadata,
  revision: Revision,
  runtimeLabel: string,
  typeChecked: boolean,
): string {
  const examples = revision.cases.filter((c) => !c.hidden);
  const visible = casesRun(revision.cases, "examples").length;
  const parts = [`# ${metadata.title}`, "## Goal and requirements", revision.task.trim()];
  if (revision.schema) parts.push("## Data schema", "```sql\n" + revision.schema.trim() + "\n```");
  if (examples.length)
    parts.push(
      "## Examples (input → expected)",
      examples
        .map(
          (e, i) =>
            `${i + 1}. ${e.name ? `${e.name}\n   ` : ""}${compactJson(e.input)}\n   → ${compactJson(e.expected)}`,
        )
        .join("\n"),
    );
  parts.push(
    `## Your code: ${revision.file} (${toolchain(runtimeLabel)})`,
    "```\n" + numbered(revision.starter) + "\n```",
    `Change the code to meet the requirements, then run the ${visible} ${
      visible === 1 ? "example" : "examples"
    } as often as you like. Submit checks every case.` +
      (typeChecked ? " Type errors are shown after each edit." : ""),
  );
  return parts.join("\n\n");
}

function diagnosticsText(code: string, diagnostics: readonly TypeDiagnostic[]): string {
  if (!diagnostics.length) return "No type errors shown.";
  return [
    "Type errors shown:",
    ...diagnostics.map((d) => `- ${place(code, d.from)}: ${d.severity}: ${d.message}`),
  ].join("\n");
}

/** After edit_code or write_code. */
export function edited(result: Edited, file: string, error: string | null): string {
  const parts = [
    error ?? `Edited ${file}.`,
    "```\n" + numbered(result.code) + "\n```",
  ];
  if (result.diagnostics) parts.push(diagnosticsText(result.code, result.diagnostics));
  return parts.join("\n\n");
}

/** After run_examples or submit: the feedback a person sees, then the Output panel. */
export function ran(result: Ran, revision: Revision, runtimeLabel: string): string {
  const output = transcript(result.run, revision, runtimeLabel)
    .map((line) => line.text)
    .join("\n");
  if (result.run.purpose !== "submit") return output;
  const verdict = result.run.verdict ?? null;
  const feedback = checkFeedbackOf({
    running: false,
    completed: result.completed,
    edited: false,
    verdict,
    diagnosis: verdict ? diagnose(result.run.outcome ?? null, revision.cases) : null,
  });
  const lines = [feedback.headline];
  for (const rule of feedback.required) lines.push(`- ${rule.text}`);
  if (feedback.next) lines.push(feedback.next);
  return `${lines.join("\n")}\n\n${output}`;
}
