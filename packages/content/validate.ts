/**
 * Structural checks for a catalog, shared by authoring and serving. Pure: no hashing, so the
 * content-hash check lives in ./revision.
 */
import type {
  Catalog,
  Difficulty,
  IssueKind,
  Revision,
  Trigger,
} from "./model";
import { engineFor } from "../runner/engines";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const KEY = /^[A-Z][A-Z0-9]{1,4}$/;
const REVISION = /^sha256:[0-9a-f]{64}$/;
const DIFFICULTIES: readonly Difficulty[] = ["warm-up", "easy", "medium", "hard"];
const KINDS: readonly IssueKind[] = ["feature", "bug", "performance", "refactor"];
const STATES = ["draft", "live", "retired", "disabled"];
const ROLES = ["edit", "read", "tests", "docs"];

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

function checkTrigger(trigger: Trigger, where: string): void {
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
  } else if (
    !("event" in trigger || "metric" in trigger || "check" in trigger || "behaviour" in trigger)
  )
    fail(where, "an unknown trigger");
}

export function validateRevision(revision: Revision, where: string): void {
  if (!ID.test(revision.issue)) fail(where, "issue id is not a slug");
  if (!KINDS.includes(revision.kind)) fail(where, `unknown kind ${revision.kind}`);
  text(revision.body, `${where} body`);
  if (revision.format !== "code-change") fail(where, `unknown format ${revision.format}`);
  const { workspace } = revision;
  text(workspace.language, `${where} language`);
  text(workspace.entrypoint, `${where} entrypoint`);
  const files = Object.entries(workspace.files);
  if (!files.some(([, f]) => f.role === "edit"))
    fail(where, "needs at least one editable file");
  const entry = workspace.files[workspace.entry];
  if (!entry || (entry.role !== "edit" && entry.role !== "read"))
    fail(where, `entry ${workspace.entry} is not one of its source files`);
  const sources = files.filter(([, f]) => f.role === "edit" || f.role === "read");
  // Only some runners load more than one file (engines.ts `multiFile`).
  if (sources.length > 1 && !engineFor(workspace.language)?.multiFile)
    fail(where, `${workspace.language} cannot load more than one source file yet`);
  for (const [path, file] of files) {
    if (!/^[\w./-]+$/.test(path) || path.startsWith("/") || path.includes(".."))
      fail(where, `unsafe file path ${path}`);
    if (!ROLES.includes(file.role)) fail(where, `${path} has an unknown role`);
    if (typeof file.text !== "string") fail(where, `${path} has no text`);
  }
  const cases = revision.checks.cases;
  if (!cases.length) fail(where, "needs at least one case");
  unique(cases.map((c) => c.id), `${where} cases`);
  if (workspace.parameters)
    for (const c of cases)
      if (!Array.isArray(c.input) || c.input.length !== workspace.parameters.length)
        fail(where, `case ${c.id} must list one argument per parameter`);
  unique(revision.team.map((c) => c.id), `${where} team comments`);
  for (const comment of revision.team) {
    if (!comment.text.length) fail(where, `comment ${comment.id} has no text`);
    checkTrigger(comment.when, `${where} comment ${comment.id}`);
  }
  unique(revision.hints.map((h) => h.id), `${where} hints`);
  revision.hints.forEach((hint, index) => {
    if (hint.level !== index + 1) fail(where, "hint levels must run 1, 2, 3, … in order");
    text(hint.text, `${where} hint ${hint.id}`);
    checkTrigger(hint.when, `${where} hint ${hint.id}`);
  });
}

/** Throws with the first problem found; returns the catalog typed. */
export function validateCatalog(value: unknown): Catalog {
  const catalog = value as Catalog;
  if (!catalog || catalog.schemaVersion !== "2.0.0") fail("catalog", "unsupported schema");
  const revisions = catalog.revisions ?? {};
  for (const [id, revision] of Object.entries(revisions)) {
    if (!REVISION.test(id)) fail(id, "is not a revision id");
    validateRevision(revision, `revision ${id.slice(0, 15)}… of ${revision.issue}`);
  }
  unique(catalog.projects.map((p) => p.id), "projects");
  unique(catalog.projects.map((p) => p.key), "project keys");
  unique(catalog.issues.map((i) => i.id), "issues");
  const projects = new Map(catalog.projects.map((p) => [p.id, p]));
  for (const project of catalog.projects) {
    if (!ID.test(project.id)) fail(project.id, "project id is not a slug");
    if (!KEY.test(project.key)) fail(project.id, `key ${project.key} is not 2–5 capitals`);
    text(project.title, `${project.id} title`);
    unique(project.issues, `${project.id} issues`);
  }
  const numbers = new Set<string>();
  for (const issue of catalog.issues) {
    const where = `issue ${issue.id}`;
    if (!ID.test(issue.id)) fail(where, "id is not a slug");
    const project = projects.get(issue.project);
    if (!project) fail(where, `unknown project ${issue.project}`);
    if (!project.issues.includes(issue.id)) fail(where, "is not in its project's order");
    if (!Number.isInteger(issue.number) || issue.number < 1) fail(where, "needs a number");
    const key = `${project.key}-${issue.number}`;
    if (numbers.has(key)) fail(where, `${key} is taken`);
    numbers.add(key);
    text(issue.title, `${where} title`);
    if (!DIFFICULTIES.includes(issue.difficulty)) fail(where, "unknown difficulty");
    if (!STATES.includes(issue.state)) fail(where, "unknown state");
    const revision = revisions[issue.revision];
    if (!revision) fail(where, `live revision ${issue.revision} is missing`);
    if (revision.issue !== issue.id) fail(where, "live revision belongs to another issue");
  }
  for (const project of catalog.projects)
    for (const id of project.issues)
      if (!catalog.issues.some((i) => i.id === id))
        fail(project.id, `lists unknown issue ${id}`);
  return catalog;
}
