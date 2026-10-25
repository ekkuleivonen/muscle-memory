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

export interface Challenge {
  /** Permanent, as recorded data names it: PY-003, the language's code and a number. */
  key: string;
  /** The live revision: sha256:… of its content. */
  revision: string;
  title: string;
  summary: string;
  /** A sharper invitation for shared links, when the challenge has one. */
  hook?: string;
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
export type ChallengeSummary = Omit<Challenge, "task" | "criteria">;

export function summarize({ task: _task, criteria: _criteria, ...summary }: Challenge): ChallengeSummary {
  return summary;
}

export function languageLabel(id: string | undefined): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? "Any language";
}

/** Whether the browser can run this revision's code: an engine, plus what that engine needs. */
export function runnable(revision: Revision): boolean {
  const { language, schema, adapter } = revision;
  return (
    !!engineFor(language) &&
    (language !== "sql" || typeof schema === "string") &&
    // C, C++ and Java need the challenge's adapter to call the function.
    ((language !== "c" && language !== "cpp" && language !== "java") ||
      typeof adapter === "string")
  );
}

function toIssue(meta: ChallengeMetadata, revision: Revision): Challenge {
  return {
    key: meta.key,
    revision: meta.revision,
    title: meta.title,
    summary: meta.summary,
    ...(meta.hook ? { hook: meta.hook } : {}),
    task: revision.task,
    difficulty: meta.difficulty,
    language: LANGUAGES.find((l) => l.id === revision.language)?.id,
    tags: meta.tags,
    criteria: revision.cases
      .filter((c) => !c.hidden)
      .map(({ input, expected }) => ({ input, expected })),
    runnable: runnable(revision),
  };
}

export interface ChallengeIndex {
  /** Every challenge, by key. */
  challenges: Challenge[];
  /** A challenge by its key, in any case. */
  findChallenge(ref: string): Challenge | undefined;
  /** A live revision by id. */
  revision(id: string): Revision | undefined;
}

export function indexChallenges(catalog: Catalog): ChallengeIndex {
  const challenges = catalog.challenges.map((meta) =>
    toIssue(meta, catalog.revisions[meta.revision]),
  );
  return {
    challenges,
    findChallenge: (ref) => challenges.find((i) => i.key === ref.toUpperCase()),
    revision: (id) => catalog.revisions[id],
  };
}
