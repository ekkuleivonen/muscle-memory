/**
 * The issue model (docs/issue-model.md). An issue has one permanent identity and live
 * metadata; what a player works against is an immutable revision, identified by the SHA-256
 * of its canonical JSON. Only the latest revision is live, and recorded data names the
 * revision it ran against. Pure types and helpers: no filesystem, no hashing (see ./revision).
 */
import type { Json } from "../domain/json";

export type Difficulty = "easy" | "medium" | "hard";
export type IssueKind = "feature" | "bug" | "performance" | "refactor";
/** What the player hands in. Only code changes exist so far. */
export type Format = "code-change";
export type IssueState = "draft" | "live" | "retired" | "disabled";

/** A teammate in a project's fictional team. */
export interface Persona {
  readonly name: string;
  readonly role: string;
}

/**
 * When a teammate comment or hint is released. Every trigger is a pure function of recorded
 * facts, so it can be re-evaluated later and gives the same answer (./triggers). Events:
 * opened is the issue's thread as the ticket shows it; pull-request is opening one (push 1);
 * push is every later push to it. Investigation: `opened` fires once the person has opened a
 * file of the repo themselves; `ran` reads the latest local run (Run tests), as `check` reads
 * the latest pull request's checks.
 */
export type Trigger =
  | { readonly event: "opened" | "pull-request" | "push" }
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
  | { readonly check: string; readonly is: "failing" | "passing" }
  | { readonly ran: string; readonly is: "failing" | "passing" }
  | { readonly opened: string }
  | {
      readonly behaviour:
        | "active-minutes-without-progress"
        | "failing-pushes"
        | "runs-without-progress";
      readonly atLeast: number;
    }
  | { readonly all: readonly Trigger[] }
  | { readonly any: readonly Trigger[] }
  | { readonly not: Trigger };

export interface TeamComment {
  readonly id: string;
  readonly author: Persona;
  /** The issue's thread, or a review on the pull request. */
  readonly where: "issue" | "review";
  /** Blocking needs a code change or a reply before merging; a nit never blocks. */
  readonly severity: "blocking" | "nit" | "info";
  /** A few wordings of the same comment; one is picked per player, so it stays stable. */
  readonly text: readonly string[];
  /**
   * An issue comment is evaluated whenever feedback is (opening, runs, pushes, every half
   * minute); a review comment only when a push's checks finish, with the pushed code.
   */
  readonly when: Trigger;
  /**
   * once (default): at most once per issue, or per pull request for a review comment.
   * while-true: a resolved review thread opens again on a later push that triggers it.
   */
  readonly repeat?: "once" | "while-true";
  /**
   * A review finding only the person's Resolve clears: a push that stops triggering it, or a
   * reply, leaves it open. Absent: a fixing push or (for a blocking one) a reply also resolves.
   */
  readonly resolve?: "explicit";
}

/** An idea about the approach, never solution code; released strictly in level order. */
export interface Hint {
  readonly id: string;
  readonly level: number;
  readonly author: Persona;
  readonly text: string;
  readonly when: Trigger;
}

/**
 * edit: the player may change it, and it is recorded. read: source code the program uses but
 * the player may not change. tests: the visible acceptance tests. docs: everything else shown
 * read-only (README, a SQL schema).
 */
export type FileRole = "edit" | "read" | "tests" | "docs";

export interface WorkspaceFile {
  readonly role: FileRole;
  /** Editor language: the issue's language, or another one (a SQL schema, a README). */
  readonly language: string;
  readonly text: string;
}

export interface Workspace {
  readonly language: string;
  /** Path → file. At least one is editable. */
  readonly files: Readonly<Record<string, WorkspaceFile>>;
  /** The source file that defines the entry point; CI loads it and calls the function. */
  readonly entry: string;
  /** The function CI calls. */
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
  /** What the case is about, as the repo's test names it; unnamed cases are numbered. */
  readonly name?: string;
  readonly input: Json;
  readonly expected: Json;
  /**
   * In the repo's test file. The others only run in the full check, whose results give them by
   * name and failure category, never their values (apps/web/lib/diagnosis.ts).
   */
  readonly visible: boolean;
}

/** Everything a player works against. Changing any of it makes a new revision. */
export interface Revision {
  readonly issue: string;
  readonly kind: IssueKind;
  /** Markdown: the ticket. */
  readonly body: string;
  readonly skills: readonly string[];
  readonly format: Format;
  readonly workspace: Workspace;
  /** CI: deterministic, decides merging. */
  readonly checks: { readonly cases: readonly Case[] };
  readonly team: readonly TeamComment[];
  readonly hints: readonly Hint[];
  /**
   * explicit: a push whose checks fail opens a CI finding on its pull request, which only the
   * person's Resolve clears (a later passing push does not). The checks themselves still decide
   * merging on their own. Absent: CI failures are shown, not resolvable findings.
   */
  readonly ciFindings?: "explicit";
  readonly authored: {
    /** ai-drafted: written with a model and not yet reviewed by a person. */
    readonly by: "human" | "ai-drafted" | "ai-drafted-human-reviewed";
    readonly reviewers: readonly string[];
  };
}

/** Live metadata: editable without a new revision; every edit goes to a change log. */
export interface IssueMetadata {
  /** Permanent: "refund-totals". */
  readonly id: string;
  readonly project: string;
  /** Permanent: SHOP-7 is project key + number. */
  readonly number: number;
  readonly title: string;
  readonly summary: string;
  readonly difficulty: Difficulty;
  readonly estimate: number;
  readonly labels: readonly string[];
  readonly state: IssueState;
  /** The live revision's id. */
  readonly revision: string;
}

export interface Project {
  /** Permanent: "storefront". */
  readonly id: string;
  /** Issue keys start with it: SHOP-1. */
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  /** Markdown: what the project is and what working on it is like. */
  readonly story: string;
  /** Issue ids in board order. */
  readonly issues: readonly string[];
  /**
   * Listed projects appear in issue lists, suggestions and the project index. An unlisted one
   * (the five-minute test's quick fixes) is reachable only by its issues' keys and links.
   */
  readonly listed: boolean;
}

/**
 * What players are served: the live index (projects and issue metadata) plus every revision
 * ever published, by id. In production the index and each revision are separate objects in
 * object storage; locally they are one file.
 */
export interface Catalog {
  readonly schemaVersion: "2.0.0";
  readonly projects: readonly Project[];
  readonly issues: readonly IssueMetadata[];
  readonly revisions: Readonly<Record<string, Revision>>;
}

/** Story points shown as an estimate, in the 1-2-3-5 scale trackers use. */
export const ESTIMATES: Record<Difficulty, number> = {
  easy: 2,
  medium: 3,
  hard: 5,
};

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

/**
 * The cases a run checks: Run tests runs the repo's own tests (the visible cases); CI on a pull
 * request runs every case, CI-only ones included.
 */
export function casesRun<C extends { readonly visible: boolean }>(
  cases: readonly C[],
  purpose: "local" | "pull-request",
): C[] {
  return purpose === "pull-request" ? [...cases] : cases.filter((c) => c.visible);
}

/** What CI needs to run a revision's code: the engine's inputs, without the repo. */
export interface Executable {
  readonly language: string;
  /** The source file CI loads, and the program's other source files by path. */
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
