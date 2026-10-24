/**
 * Publish checks on a revision and its private part (docs/issue-model.md). The private part
 * (reference solution, trigger examples) is never published; these checks are why it exists.
 * Everything here reads code as text and runs nothing: whether the reference passes and the
 * starter fails is checked in the browser sandbox (tools/browser/content-check.ts).
 */
import { editableFiles, sourceFiles, type Revision } from "./model";
import { evaluate } from "./triggers";

export interface Private {
  /** The editable files after a correct fix, by path. */
  readonly reference: Readonly<Record<string, string>>;
  /** Per teammate comment: edits that must fire it, and edits that must not. */
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

const idle = { activeMinutesWithoutProgress: 0, runsWithoutProgress: 0, failingPushes: 0 };

/** The editable files as the starter has them, with `changes` applied. */
function edited(revision: Revision, changes: Readonly<Record<string, string>>) {
  return {
    ...Object.fromEntries(
      Object.entries(editableFiles(revision.workspace)).map(([path, f]) => [path, f.text]),
    ),
    ...changes,
  };
}

/** What a push of these files would trigger, before any checks have run. */
function fires(revision: Revision, id: string, changes: Readonly<Record<string, string>>) {
  const comment = revision.team.find((c) => c.id === id)!;
  return evaluate(comment.when, {
    files: edited(revision, changes),
    behaviour: idle,
    event: "push",
  });
}

/** Problems that keep a revision from being published; empty when it may go live. */
export function publishProblems(revision: Revision, secret: Private): string[] {
  const problems: string[] = [];
  const editable = editableFiles(revision.workspace);
  for (const path of Object.keys(secret.reference))
    if (!editable[path]) problems.push(`the reference changes ${path}, which is not editable`);
  if (
    Object.entries(secret.reference).every(([path, text]) => editable[path]?.text === text)
  )
    problems.push("the reference is the starter unchanged");

  const examples = secret.examples ?? {};
  for (const [id, { fires: firing, quiet }] of Object.entries(examples)) {
    if (!revision.team.some((c) => c.id === id)) {
      problems.push(`examples for unknown comment ${id}`);
      continue;
    }
    firing.forEach((example, i) => {
      if (!fires(revision, id, example)) problems.push(`${id}: example ${i + 1} should fire it`);
    });
    quiet.forEach((example, i) => {
      if (fires(revision, id, example))
        problems.push(`${id}: quiet example ${i + 1} fires it`);
    });
  }
  for (const comment of revision.team)
    if (comment.severity === "blocking") {
      const own = examples[comment.id];
      if (!own?.fires.length || !own.quiet.length)
        problems.push(`blocking comment ${comment.id} needs examples that fire it and that do not`);
      // A correct fix must be mergeable without arguing.
      if (fires(revision, comment.id, secret.reference))
        problems.push(`blocking comment ${comment.id} fires on the reference solution`);
    }

  // A hint is an idea, never the fix: no line the reference adds may appear in one.
  const starter = new Set(
    Object.values(sourceFiles(revision.workspace)).flatMap((f) =>
      f.text.split("\n").map((l) => l.trim()),
    ),
  );
  const added = Object.values(secret.reference)
    .flatMap((text) => text.split("\n").map((l) => l.trim()))
    .filter((line) => line.length >= 12 && !starter.has(line));
  for (const hint of revision.hints)
    for (const line of added)
      if (hint.text.includes(line))
        problems.push(`hint ${hint.id} gives away the reference: ${line}`);
  return problems;
}
