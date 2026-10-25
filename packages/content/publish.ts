/**
 * Publish checks on a revision and its private part (docs/challenges.md). The private part
 * (reference solution, rule examples) is never published; these checks are why it exists.
 * Everything here reads code as text and runs nothing: whether the reference passes and the
 * starter fails is checked in the browser sandbox (tools/browser/content-check.ts).
 */
import { editableFiles, type Revision } from "./model";
import { fires } from "./rules";

export interface Private {
  /** The editable file after a correct solution, by path. */
  readonly reference: Readonly<Record<string, string>>;
  /** Other correct designs and plausible wrong ones; the browser check runs them. */
  readonly alternatives?: readonly Readonly<Record<string, string>>[];
  readonly wrong?: readonly Readonly<Record<string, string>>[];
  /** Per rule: edits that must fire it, and edits that must not. */
  readonly examples?: Readonly<
    Record<
      string,
      {
        readonly fires: readonly Readonly<Record<string, string>>[];
        readonly quiet: readonly Readonly<Record<string, string>>[];
      }
    >
  >;
}

/** The editable file as the starter has it, with `changes` applied. */
function edited(revision: Revision, changes: Readonly<Record<string, string>>) {
  return {
    ...Object.fromEntries(
      Object.entries(editableFiles(revision.workspace)).map(([path, f]) => [path, f.text]),
    ),
    ...changes,
  };
}

function ruleFires(revision: Revision, id: string, changes: Readonly<Record<string, string>>) {
  const rule = revision.checks.rules.find((r) => r.id === id)!;
  return fires(rule.when, edited(revision, changes));
}

/**
 * Languages whose challenges must show their checks are fair: at least one other correct design
 * that passes and plausible wrong solutions that fail (the browser check runs both).
 */
const AUDITED = new Set(["javascript", "python"]);

/** Problems that keep a revision from being published; empty when it may go live. */
export function publishProblems(revision: Revision, secret: Private): string[] {
  const problems: string[] = [];
  const editable = editableFiles(revision.workspace);
  for (const path of Object.keys(secret.reference))
    if (!editable[path]) problems.push(`the reference changes ${path}, which is not editable`);
  if (Object.entries(secret.reference).every(([path, text]) => editable[path]?.text === text))
    problems.push("the reference is the starter unchanged");
  for (const [kind, list] of [
    ["alternative", secret.alternatives ?? []],
    ["wrong solution", secret.wrong ?? []],
  ] as const)
    list.forEach((change, i) => {
      for (const path of Object.keys(change))
        if (!editable[path]) problems.push(`${kind} ${i + 1} changes ${path}, which is not editable`);
    });

  const examples = secret.examples ?? {};
  const rules = revision.checks.rules;
  for (const [id, { fires: firing, quiet }] of Object.entries(examples)) {
    if (!rules.some((r) => r.id === id)) {
      problems.push(`examples for unknown rule ${id}`);
      continue;
    }
    firing.forEach((example, i) => {
      if (!ruleFires(revision, id, example)) problems.push(`${id}: example ${i + 1} should fire it`);
    });
    quiet.forEach((example, i) => {
      if (ruleFires(revision, id, example)) problems.push(`${id}: quiet example ${i + 1} fires it`);
    });
  }
  for (const rule of rules) {
    const own = examples[rule.id];
    if (!own?.fires.length || !own.quiet.length)
      problems.push(`rule ${rule.id} needs examples that fire it and that do not`);
    // A correct solution must complete, whichever correct design it is.
    if (ruleFires(revision, rule.id, secret.reference))
      problems.push(`rule ${rule.id} fires on the reference solution`);
    (secret.alternatives ?? []).forEach((change, i) => {
      if (ruleFires(revision, rule.id, change))
        problems.push(`rule ${rule.id} fires on alternative ${i + 1}`);
    });
  }
  if (AUDITED.has(revision.workspace.language)) {
    if (!secret.alternatives?.length)
      problems.push("no alternative: name another correct design the checks accept");
    if ((secret.wrong?.length ?? 0) < 2)
      problems.push("fewer than two wrong solutions: name plausible mistakes the checks must catch");
  }
  return problems;
}
