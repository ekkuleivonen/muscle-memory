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
const EVENTS = ["opened", "pull-request", "push"];
const METRICS = ["lines", "function-lines", "nesting"];
const BEHAVIOURS = ["active-minutes-without-progress", "failing-pushes", "runs-without-progress"];

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

function checkTrigger(
  trigger: Trigger,
  where: string,
  cases: Set<string>,
  files: Set<string>,
): void {
  if ("all" in trigger || "any" in trigger) {
    const list = "all" in trigger ? trigger.all : trigger.any;
    if (!Array.isArray(list) || !list.length) fail(where, "an empty trigger list");
    list.forEach((t) => checkTrigger(t, where, cases, files));
  } else if ("not" in trigger) checkTrigger(trigger.not, where, cases, files);
  else if ("pattern" in trigger) {
    try {
      new RegExp(trigger.pattern);
    } catch {
      fail(where, `invalid pattern ${trigger.pattern}`);
    }
  } else if ("event" in trigger) {
    if (!EVENTS.includes(trigger.event)) fail(where, `unknown event ${trigger.event}`);
  } else if ("metric" in trigger) {
    if (!METRICS.includes(trigger.metric)) fail(where, `unknown metric ${trigger.metric}`);
    if (!Number.isFinite(trigger.above)) fail(where, "a metric needs a bound");
  } else if ("behaviour" in trigger) {
    if (!BEHAVIOURS.includes(trigger.behaviour))
      fail(where, `unknown behaviour ${trigger.behaviour}`);
    if (!Number.isInteger(trigger.atLeast) || trigger.atLeast < 1)
      fail(where, "a behaviour needs a whole-number threshold");
  } else if ("check" in trigger) {
    if (!cases.has(trigger.check)) fail(where, `unknown case ${trigger.check}`);
  } else if ("ran" in trigger) {
    if (!cases.has(trigger.ran)) fail(where, `unknown case ${trigger.ran}`);
  } else if ("opened" in trigger) {
    if (!files.has(trigger.opened)) fail(where, `unknown file ${trigger.opened}`);
  } else fail(where, "an unknown trigger");
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
  for (const c of cases)
    if (c.name !== undefined) text(c.name, `${where} case ${c.id} name`);
  const caseIds = new Set(cases.map((c) => c.id));
  const paths = new Set(Object.keys(workspace.files));
  unique(revision.team.map((c) => c.id), `${where} team comments`);
  for (const comment of revision.team) {
    if (!ID.test(comment.id)) fail(where, `comment id ${comment.id} is not a slug`);
    if (!comment.text.length) fail(where, `comment ${comment.id} has no text`);
    if (!["issue", "review"].includes(comment.where))
      fail(where, `comment ${comment.id} is neither on the issue nor a review`);
    if (!["blocking", "nit", "info"].includes(comment.severity))
      fail(where, `comment ${comment.id} has an unknown severity`);
    // Only a review thread can be resolved, by a push or a reply, before merging.
    if (comment.severity === "blocking" && comment.where !== "review")
      fail(where, `comment ${comment.id} blocks merging, so it must be a review comment`);
    checkTrigger(comment.when, `${where} comment ${comment.id}`, caseIds, paths);
    if (comment.resolve !== undefined && (comment.resolve !== "explicit" || comment.where !== "review"))
      fail(where, `comment ${comment.id}: only a review comment can need an explicit Resolve`);
  }
  if (revision.ciFindings !== undefined && revision.ciFindings !== "explicit")
    fail(where, "ciFindings is explicit or absent");
  if (revision.chat) {
    unique(revision.chat.map((c) => c.id), `${where} chat`);
    for (const line of revision.chat) {
      if (!ID.test(line.id)) fail(where, `chat line ${line.id} is not a slug`);
      text(line.text, `${where} chat ${line.id}`);
      text(line.author?.name, `${where} chat ${line.id} author`);
      const after = line.after as Record<string, unknown>;
      if (after?.start === true || after?.pullRequest === true || after?.merged === true) continue;
      if (typeof after?.opened === "string") {
        if (!paths.has(after.opened)) fail(where, `chat ${line.id} names unknown file ${after.opened}`);
        continue;
      }
      const id = (after?.ran ?? after?.check) as unknown;
      if (typeof id !== "string" || !caseIds.has(id) || !["failing", "passing"].includes(String(after.is)))
        fail(where, `chat ${line.id} has an unknown trigger`);
    }
  }
  unique(revision.hints.map((h) => h.id), `${where} hints`);
  revision.hints.forEach((hint, index) => {
    if (hint.level !== index + 1) fail(where, "hint levels must run 1, 2, 3, … in order");
    text(hint.text, `${where} hint ${hint.id}`);
    checkTrigger(hint.when, `${where} hint ${hint.id}`, caseIds, paths);
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
    if (typeof project.listed !== "boolean") fail(project.id, "needs listed true or false");
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
