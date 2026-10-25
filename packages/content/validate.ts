/**
 * Structural checks for a catalog, shared by authoring and serving. Pure: no hashing, so the
 * content-hash check lives in ./revision.
 */
import { keyProblem } from "./keys";
import type { Catalog, Difficulty, Revision, RuleTrigger } from "./model";
import { engineFor } from "../runner/engines";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TAG = /^[a-z0-9][a-z0-9-]{0,31}$/;
const REVISION = /^sha256:[0-9a-f]{64}$/;
const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
const ROLES = ["edit", "read"];
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
  if (!ID.test(revision.challenge)) fail(where, "challenge id is not a slug");
  text(revision.body, `${where} body`);
  const { workspace } = revision;
  text(workspace.language, `${where} language`);
  text(workspace.entrypoint, `${where} entrypoint`);
  const files = Object.entries(workspace.files);
  const editable = files.filter(([, f]) => f.role === "edit");
  // One file to change: the entry. Anything else is source it reads.
  if (editable.length !== 1 || editable[0][0] !== workspace.entry)
    fail(where, `the entry ${workspace.entry} must be the one editable file`);
  // Only some runners load more than one file (engines.ts `multiFile`).
  if (files.length > 1 && !engineFor(workspace.language)?.multiFile)
    fail(where, `${workspace.language} cannot load more than one source file yet`);
  for (const [path, file] of files) {
    if (!/^[\w./-]+$/.test(path) || path.startsWith("/") || path.includes(".."))
      fail(where, `unsafe file path ${path}`);
    if (!ROLES.includes(file.role)) fail(where, `${path} has an unknown role`);
    if (typeof file.text !== "string") fail(where, `${path} has no text`);
  }
  const cases = revision.checks.cases;
  if (!cases.length) fail(where, "needs at least one case");
  if (!cases.some((c) => c.visible)) fail(where, "needs at least one example");
  unique(
    cases.map((c) => c.id),
    `${where} cases`,
  );
  if (workspace.parameters)
    for (const c of cases)
      if (!Array.isArray(c.input) || c.input.length !== workspace.parameters.length)
        fail(where, `case ${c.id} must list one argument per parameter`);
  for (const c of cases) if (c.name !== undefined) text(c.name, `${where} case ${c.id} name`);
  const rules = revision.checks.rules;
  unique(
    rules.map((r) => r.id),
    `${where} rules`,
  );
  for (const rule of rules) {
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
    catalog.challenges.map((c) => c.id),
    "challenge ids",
  );
  unique(
    catalog.challenges.map((c) => c.key),
    "challenge keys",
  );
  for (const challenge of catalog.challenges) {
    const where = `challenge ${challenge.id}`;
    if (!ID.test(challenge.id)) fail(where, "id is not a slug");
    text(challenge.title, `${where} title`);
    if (typeof challenge.summary !== "string") fail(where, "needs a summary");
    if (!DIFFICULTIES.includes(challenge.difficulty)) fail(where, "unknown difficulty");
    if (!Array.isArray(challenge.tags) || !challenge.tags.every((t: string) => TAG.test(t)))
      fail(where, "tags are lowercase slugs");
    const revision = revisions[challenge.revision];
    if (!revision) fail(where, `revision ${challenge.revision} is missing`);
    if (revision.challenge !== challenge.id) fail(where, "its revision belongs to another challenge");
    const problem = keyProblem(challenge.key, revision.workspace.language);
    if (problem) fail(where, problem);
  }
  return catalog;
}
