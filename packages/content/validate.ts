/**
 * Structural checks for a catalog, shared by authoring and serving. Pure: no hashing, so the
 * content-hash check lives in ./revision.
 */
import { keyProblem } from "./keys";
import type { Catalog, Difficulty, Revision, RuleTrigger } from "./model";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TAG = /^[a-z0-9][a-z0-9-]{0,31}$/;
const REVISION = /^sha256:[0-9a-f]{64}$/;
const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
const METRICS = ["lines", "function-lines", "nesting"];

function fail(where: string, problem: string): never {
  throw new Error(`${where}: ${problem}`);
}

function text(value: unknown, where: string): string {
  if (typeof value !== "string" || !value.trim()) fail(where, "needs text");
  return value;
}

function unique(values: readonly string[], where: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) fail(where, `"${value}" appears twice`);
    seen.add(value);
  }
}

function checkTrigger(trigger: RuleTrigger, where: string): void {
  if ("all" in trigger || "any" in trigger) {
    const list = "all" in trigger ? trigger.all : trigger.any;
    if (!Array.isArray(list) || !list.length) fail(where, "an empty trigger list");
    list.forEach((t) => checkTrigger(t, where));
  } else if ("not" in trigger) checkTrigger(trigger.not, where);
  else if ("pattern" in trigger) {
    try {
      new RegExp(trigger.pattern);
    } catch {
      fail(where, `invalid pattern ${trigger.pattern}`);
    }
    if (typeof trigger.present !== "boolean") fail(where, "a pattern says present or not");
  } else if ("metric" in trigger) {
    if (!METRICS.includes(trigger.metric)) fail(where, `unknown metric ${trigger.metric}`);
    if (!Number.isFinite(trigger.above)) fail(where, "a metric needs a bound");
  } else fail(where, "an unknown trigger");
}

export function validateRevision(revision: Revision, where: string): void {
  const problem = keyProblem(revision.challenge, revision.language);
  if (problem) fail(where, problem);
  text(revision.task, `${where} task`);
  text(revision.entrypoint, `${where} entrypoint`);
  if (typeof revision.starter !== "string") fail(where, "needs a starter");
  const { file } = revision;
  if (!/^[\w./-]+$/.test(file) || file.startsWith("/") || file.includes(".."))
    fail(where, `unsafe file name ${file}`);
  const cases = revision.cases;
  if (!cases.length) fail(where, "needs at least one case");
  if (!cases.some((c) => !c.hidden)) fail(where, "needs at least one example");
  unique(
    cases.map((c) => c.id),
    `${where} cases`,
  );
  if (revision.parameters)
    for (const c of cases)
      if (!Array.isArray(c.input) || c.input.length !== revision.parameters.length)
        fail(where, `case ${c.id} must list one argument per parameter`);
  for (const c of cases) {
    if (typeof c.hidden !== "boolean") fail(where, `case ${c.id} says whether it is hidden`);
    if (c.name !== undefined) text(c.name, `${where} case ${c.id} name`);
  }
  unique(
    revision.rules.map((r) => r.id),
    `${where} rules`,
  );
  for (const rule of revision.rules) {
    if (!ID.test(rule.id)) fail(where, `rule id ${rule.id} is not a slug`);
    text(rule.message, `${where} rule ${rule.id}`);
    checkTrigger(rule.when, `${where} rule ${rule.id}`);
  }
}

/** Throws with the first problem found; returns the catalog typed. */
export function validateCatalog(value: unknown): Catalog {
  const catalog = value as Catalog;
  if (!catalog || catalog.schemaVersion !== "1.0.0") fail("catalog", "unsupported schema");
  if (!Array.isArray(catalog.challenges)) fail("catalog", "needs challenges");
  const revisions = catalog.revisions ?? {};
  for (const [id, revision] of Object.entries(revisions)) {
    if (!REVISION.test(id)) fail(id, "revision id is not sha256:<hex>");
    validateRevision(revision, `revision ${id}`);
  }
  unique(
    catalog.challenges.map((c) => c.key),
    "challenge keys",
  );
  for (const challenge of catalog.challenges) {
    const where = `challenge ${challenge.key}`;
    text(challenge.title, `${where} title`);
    if (typeof challenge.summary !== "string") fail(where, "needs a summary");
    if (challenge.hook !== undefined) text(challenge.hook, `${where} hook`);
    if (!DIFFICULTIES.includes(challenge.difficulty)) fail(where, "unknown difficulty");
    if (!Array.isArray(challenge.tags) || !challenge.tags.every((t: string) => TAG.test(t)))
      fail(where, "tags are lowercase slugs");
    const revision = revisions[challenge.revision];
    if (!revision) fail(where, `revision ${challenge.revision} is missing`);
    if (revision.challenge !== challenge.key) fail(where, "its revision belongs to another challenge");
  }
  return catalog;
}
