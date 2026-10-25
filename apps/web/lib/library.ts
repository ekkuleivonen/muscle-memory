/**
 * Read model for the catalog: every challenge with its live revision, as the picker, practice
 * and the share pages use it. Pure, so search and filters are testable without a server.
 */
import {
  type Catalog,
  type ChallengeMetadata,
  type Difficulty,
  type Revision,
} from "../../../packages/content/model";
import type { Json } from "../../../packages/domain/json";
import { engineFor } from "../../../packages/runner/engines";
import { LANGUAGES, type LanguageId } from "./languages";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

export interface Issue {
  /** The challenge's permanent id, as recorded data names it. */
  slug: string;
  /** Permanent identifier such as PY-003: the language's code and a number. */
  key: string;
  /** The live revision: sha256:… of its content. */
  revision: string;
  title: string;
  summary: string;
  task: string;
  difficulty: Difficulty;
  language?: LanguageId;
  tags: readonly string[];
  /** The examples: the cases that are shown. */
  criteria: { input: Json; expected: Json }[];
  /** Runs in this browser: its language has an engine and it has what the engine needs. */
  runnable: boolean;
}

/**
 * What lists and client components need. Leaves out the task and examples: besides being
 * heavier, examples cannot cross the server-to-client boundary intact (React's serializer drops
 * a "__proto__" key, which fixtures contain).
 */
export type IssueSummary = Omit<Issue, "task" | "criteria">;

export function summarize({ task: _task, criteria: _criteria, ...summary }: Issue): IssueSummary {
  return summary;
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

function toIssue(meta: ChallengeMetadata, revision: Revision): Issue {
  return {
    slug: meta.id,
    key: meta.key,
    revision: meta.revision,
    title: meta.title,
    summary: meta.summary,
    task: revision.body,
    difficulty: meta.difficulty,
    language: LANGUAGES.find((l) => l.id === revision.workspace.language)?.id,
    tags: meta.tags,
    criteria: revision.checks.cases
      .filter((c) => c.visible)
      .map(({ input, expected }) => ({ input, expected })),
    runnable: runnable(revision),
  };
}

export interface Library {
  /** Every challenge, by key. */
  issues: Issue[];
  /** A challenge by key (any case) or its permanent id. */
  findIssue(ref: string): Issue | undefined;
  /** A live revision by id. */
  revision(id: string): Revision | undefined;
}

export function library(catalog: Catalog): Library {
  const issues = catalog.challenges.map((meta) =>
    toIssue(meta, catalog.revisions[meta.revision]),
  );
  return {
    issues,
    findIssue: (ref) =>
      issues.find((i) => i.key === ref.toUpperCase()) ?? issues.find((i) => i.slug === ref),
    revision: (id) => catalog.revisions[id],
  };
}
