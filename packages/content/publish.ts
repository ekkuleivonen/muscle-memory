/**
 * Publish checks on a revision and its private part (docs/challenges.md). The private part
 * (solutions and rule examples) is never published; these checks are why it exists.
 * Everything here reads code as text and runs nothing: whether the solution passes and the
 * starter fails is checked in the browser sandbox (tools/browser/content-check.ts).
 */
import type { Revision } from "./model";
import { fires } from "./rules";
import type { Private } from "./source";

/**
 * Languages whose challenges must show their checks are fair: at least one other correct design
 * that passes and plausible wrong solutions that fail (the browser check runs both).
 */
const AUDITED = new Set(["javascript", "python"]);

/** Problems that keep a revision from being published; empty when it may go live. */
export function publishProblems(revision: Revision, secret: Private): string[] {
  const problems: string[] = [];
  const ruleFires = (id: string, code: string) =>
    fires(revision.rules.find((r) => r.id === id)!.when, code, revision.file);
  if (secret.solution === revision.starter) problems.push("the solution is the starter unchanged");
  for (const [id, { fires: firing, quiet }] of Object.entries(secret.examples)) {
    if (!revision.rules.some((r) => r.id === id)) {
      problems.push(`examples for unknown rule ${id}`);
      continue;
    }
    firing.forEach((code, i) => {
      if (!ruleFires(id, code)) problems.push(`${id}: example ${i + 1} should fire it`);
    });
    quiet.forEach((code, i) => {
      if (ruleFires(id, code)) problems.push(`${id}: quiet example ${i + 1} fires it`);
    });
  }
  for (const rule of revision.rules) {
    const own = secret.examples[rule.id];
    if (!own?.fires.length || !own.quiet.length)
      problems.push(`rule ${rule.id} needs examples that fire it and that do not`);
    // A correct solution must complete, whichever correct design it is.
    if (ruleFires(rule.id, secret.solution)) problems.push(`rule ${rule.id} fires on the solution`);
    secret.alternatives.forEach((code, i) => {
      if (ruleFires(rule.id, code)) problems.push(`rule ${rule.id} fires on alternative ${i + 1}`);
    });
  }
  if (AUDITED.has(revision.language)) {
    if (!secret.alternatives.length)
      problems.push("no alternative: name another correct design the checks accept");
    if (secret.wrong.length < 2)
      problems.push("fewer than two wrong solutions: name plausible mistakes the checks must catch");
  }
  return problems;
}
