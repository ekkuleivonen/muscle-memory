/**
 * The challenge model (docs/issue-model.md). A challenge has a permanent identity and live
 * metadata (title, summary, difficulty, tags); what a person works against is its revision,
 * identified by the SHA-256 of its canonical JSON. Recorded data names the revision it ran
 * against. Pure types and helpers: no filesystem, no hashing (see ./revision).
 */
import type { Json } from "../domain/json";

export type Difficulty = "easy" | "medium" | "hard";

/**
 * When a rule fires, read from the code alone (./rules), so the same code always gives the same
 * answer: a pattern found or missing, a size metric above a bound, or a combination.
 */
export type RuleTrigger =
  | {
      readonly metric: "lines" | "function-lines" | "nesting";
      readonly above: number;
      readonly file?: string;
    }
  | {
      readonly pattern: string;
      /** True: fires when the pattern is found; false: when it is missing. */
      readonly present: boolean;
      readonly file?: string;
    }
  | { readonly all: readonly RuleTrigger[] }
  | { readonly any: readonly RuleTrigger[] }
  | { readonly not: RuleTrigger };

/**
 * A check on the code beyond the cases, such as keeping money in whole cents. While it fires,
 * a submission is not complete, and the feedback shows its message.
 */
export interface Rule {
  readonly id: string;
  readonly message: string;
  readonly when: RuleTrigger;
}

/** edit: the one file the person changes. read: source the program uses but may not change. */
export type FileRole = "edit" | "read";

export interface WorkspaceFile {
  readonly role: FileRole;
  readonly language: string;
  readonly text: string;
}

export interface Workspace {
  readonly language: string;
  /** Path → file: the editable entry, and any source it reads. */
  readonly files: Readonly<Record<string, WorkspaceFile>>;
  /** The editable file that defines the entry point; checks load it and call the function. */
  readonly entry: string;
  /** The function the checks call. */
  readonly entrypoint: string;
  /** Named when each case's input is a list of arguments; otherwise it is the only one. */
  readonly parameters?: readonly string[];
  /** SQL: CREATE TABLE statements run before each case. */
  readonly schema?: string;
  /** C, C++ and Java: turns a case's JSON arguments into the function's types. */
  readonly adapter?: string;
}

export interface Case {
  readonly id: string;
  /** What the case is about; unnamed cases are numbered. */
  readonly name?: string;
  readonly input: Json;
  readonly expected: Json;
  /**
   * An example: shown, and run by Run examples. The others only run on Submit, whose results
   * give them by position and failure category, never their values (apps/web/lib/diagnosis.ts).
   */
  readonly visible: boolean;
}

/** Everything a person works against. Changing any of it makes a new revision. */
export interface Revision {
  readonly challenge: string;
  /** Markdown: the task. */
  readonly body: string;
  readonly workspace: Workspace;
  /** Deterministic: a submission is complete when every case passes and no rule fires. */
  readonly checks: { readonly cases: readonly Case[]; readonly rules: readonly Rule[] };
}

/** Live metadata: editable without a new revision. */
export interface ChallengeMetadata {
  /** Permanent: "refund-totals". */
  readonly id: string;
  /** Permanent: PY-003, the language's code and a number (packages/content/keys.ts). */
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  readonly difficulty: Difficulty;
  readonly tags: readonly string[];
  /** The live revision's id. */
  readonly revision: string;
}

/**
 * What people are served: every challenge with its live revision, by id. In production the
 * index and each revision are separate objects in object storage; locally they are one file.
 */
export interface Catalog {
  readonly schemaVersion: "1.0.0";
  readonly challenges: readonly ChallengeMetadata[];
  readonly revisions: Readonly<Record<string, Revision>>;
}

/** The files the player edits, by path. */
export function editableFiles(workspace: Workspace): Record<string, WorkspaceFile> {
  return Object.fromEntries(
    Object.entries(workspace.files).filter(([, f]) => f.role === "edit"),
  );
}

/** Source files the program is made of: what the player edits plus code it may only read. */
export function sourceFiles(workspace: Workspace): Record<string, WorkspaceFile> {
  return Object.fromEntries(
    Object.entries(workspace.files).filter(
      ([, f]) => f.role === "edit" || f.role === "read",
    ),
  );
}

/** The cases a run checks: Run examples runs the examples; Submit runs every case. */
export function casesRun<C extends { readonly visible: boolean }>(
  cases: readonly C[],
  purpose: "examples" | "submit",
): C[] {
  return purpose === "submit" ? [...cases] : cases.filter((c) => c.visible);
}

/** What a run needs from a revision: the engine's inputs. */
export interface Executable {
  readonly language: string;
  /** The source file a run loads. */
  readonly entry: string;
  readonly entrypoint: string;
  readonly parameters?: readonly string[];
  readonly schema?: string;
  readonly adapter?: string;
  readonly cases: readonly Case[];
}

export function executableOf(revision: Revision): Executable {
  const { language, entry, entrypoint, parameters, schema, adapter } = revision.workspace;
  return {
    language,
    entry,
    entrypoint,
    ...(parameters ? { parameters } : {}),
    ...(schema ? { schema } : {}),
    ...(adapter ? { adapter } : {}),
    cases: revision.checks.cases,
  };
}
