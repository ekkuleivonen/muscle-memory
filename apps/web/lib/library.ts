/**
 * Read model for browsing the catalog as an issue tracker: live issues with their live
 * revisions, grouped into projects. Pure, so pages, search and filters are testable without a
 * server.
 */
import { inTicket } from "./feedback";
import {
  ESTIMATES,
  type Catalog,
  type Difficulty,
  type IssueKind,
  type IssueMetadata,
  type Revision,
} from "../../../packages/content/model";
import type { Json } from "../../../packages/domain/json";
import { engineFor } from "../../../packages/runner/engines";
import { LANGUAGES, type LanguageId } from "./languages";

export { ESTIMATES };
export const DIFFICULTIES: readonly Difficulty[] = [
  "easy",
  "medium",
  "hard",
];
export const KINDS: readonly IssueKind[] = [
  "feature",
  "bug",
  "performance",
  "refactor",
];
/** Number of distinct project colours the theme defines (--hue-0 …). */
export const HUES = 8;

export interface ProjectRef {
  slug: string;
  title: string;
  key: string;
  /** Index into the theme's project colours, by catalog position. */
  hue: number;
}

/** A teammate's note in the issue's thread, shown when the issue is opened. */
export interface IssueComment {
  author: string;
  role: string;
  body: string;
}

export interface Issue {
  /** The issue's permanent id, used in URLs before keys existed and in recorded data. */
  slug: string;
  /** Permanent identifier such as PY-003: the language's code and a number. */
  key: string;
  /** The live revision: sha256:… of its content. */
  revision: string;
  title: string;
  summary: string;
  task: string;
  kind: IssueKind;
  difficulty: Difficulty;
  estimate: number;
  language?: LanguageId;
  labels: readonly string[];
  /** The cases in the repo's test file; the rest only run in CI. */
  criteria: { input: Json; expected: Json }[];
  comments: readonly IssueComment[];
  /** Runs in this browser: its language has an engine and the issue has what the engine needs. */
  runnable: boolean;
  project: ProjectRef;
}

/**
 * What lists and client components need. Leaves out the description, comments and
 * acceptance criteria: besides being heavier, fixtures cannot cross the server-to-client
 * boundary intact (React's serializer drops a "__proto__" key, which fixtures contain).
 */
export type IssueSummary = Omit<Issue, "task" | "comments" | "criteria">;

export function summarize({
  task: _task,
  comments: _comments,
  criteria: _criteria,
  ...summary
}: Issue): IssueSummary {
  return summary;
}

export interface Project extends ProjectRef {
  summary: string;
  story: string;
  /** Its live issues, in board order. */
  issues: Issue[];
}

export function languageLabel(id: string | undefined): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? "Any language";
}

/** Whether the browser can run this revision's code: an engine, plus what that engine needs. */
export function runnable(revision: Revision): boolean {
  const { language, schema, adapter } = revision.workspace;
  return (
    !!engineFor(language) &&
    (language !== "sql" || typeof schema === "string") &&
    // C, C++ and Java need the issue's adapter to call the function.
    ((language !== "c" && language !== "cpp" && language !== "java") ||
      typeof adapter === "string")
  );
}

function toIssue(
  meta: IssueMetadata,
  revision: Revision,
  project: ProjectRef,
): Issue {
  return {
    slug: meta.id,
    key: meta.key,
    revision: meta.revision,
    title: meta.title,
    summary: meta.summary,
    task: revision.body,
    kind: revision.kind,
    difficulty: meta.difficulty,
    estimate: meta.estimate,
    language: LANGUAGES.find((l) => l.id === revision.workspace.language)?.id,
    labels: meta.labels,
    criteria: revision.checks.cases
      .filter((c) => c.visible)
      .map(({ input, expected }) => ({ input, expected })),
    // Notes posted when the issue is opened read as the ticket's thread.
    comments: revision.team.filter(inTicket).map((c) => ({
      author: c.author.name,
      role: c.author.role,
      body: c.text[0],
    })),
    runnable: runnable(revision),
    project,
  };
}

export interface Library {
  /** Every live issue in a listed project, by project and board order. */
  issues: Issue[];
  /** Live metadata for personal history, including unlisted exercises. Never use for discovery. */
  allIssues: Issue[];
  projects: Project[];
  /** An issue by key (any case) or its permanent id. */
  findIssue(ref: string): Issue | undefined;
  /** A project by key (any case) or its permanent id. */
  findProject(ref: string): Project | undefined;
  /** Any revision ever published, by id: recorded work names the revision it ran against. */
  revision(id: string): Revision | undefined;
  /** Every published revision of one issue, by id. */
  revisionsOf(issue: string): Record<string, Revision>;
}

export function library(catalog: Catalog): Library {
  const refs = new Map(
    catalog.projects.map((p, i): [string, ProjectRef] => [
      p.id,
      // Spread by position so neighbouring projects never share a colour.
      { slug: p.id, title: p.title, key: p.key, hue: (i * 3) % HUES },
    ]),
  );
  const byId = new Map(
    catalog.issues
      .filter((meta) => meta.state === "live")
      .map((meta) => [
        meta.id,
        toIssue(
          meta,
          catalog.revisions[meta.revision],
          refs.get(meta.project)!,
        ),
      ]),
  );
  const all = catalog.projects.map((p): Project & { listed: boolean } => ({
    ...refs.get(p.id)!,
    summary: p.summary,
    story: p.story,
    issues: p.issues.flatMap((id) => byId.get(id) ?? []),
    listed: p.listed,
  }));
  // Lists and suggestions show listed projects only; any issue or project opens by its key.
  const projects = all.filter((p) => p.listed).map(({ listed: _, ...p }) => p);
  const issues = projects.flatMap((p) => p.issues);
  const everyIssue = all.flatMap((p) => p.issues);
  return {
    issues,
    allIssues: everyIssue,
    projects,
    findIssue: (ref) =>
      everyIssue.find((i) => i.key === ref.toUpperCase()) ??
      everyIssue.find((i) => i.slug === ref),
    findProject: (ref) =>
      all.find((p) => p.key === ref.toUpperCase()) ??
      all.find((p) => p.slug === ref),
    revision: (id) => catalog.revisions[id],
    revisionsOf: (issue) =>
      Object.fromEntries(
        Object.entries(catalog.revisions).filter(([, r]) => r.issue === issue),
      ),
  };
}
