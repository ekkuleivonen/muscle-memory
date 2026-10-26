/**
 * The challenge model (docs/challenges.md). A challenge has a permanent key and live metadata
 * (title, summary, difficulty, tags); what a person works against is its revision: one file
 * to write, its cases and rules, identified by the SHA-256 of its canonical JSON. Recorded data
 * names the revision it ran against. Pure types and helpers: no filesystem, no hashing (see
 * ./revision).
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
    }
  | {
      readonly pattern: string;
      /** True: fires when the pattern is found; false: when it is missing. */
      readonly present: boolean;
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

export interface Case {
  readonly id: string;
  /** What the case is about; unnamed cases are numbered. */
  readonly name?: string;
  readonly input: Json;
  readonly expected: Json;
  /**
   * Hidden cases run only on Submit, whose results give them by position and failure category,
   * never their values (apps/web/lib/diagnosis.ts). The rest are the examples: shown with the
   * task, and run by Run examples.
   */
  readonly hidden: boolean;
}

/** Everything a person works against. Changing any of it makes a new revision. */
export interface Revision {
  /** The challenge's key. */
  readonly challenge: string;
  /** Markdown: what to do. */
  readonly task: string;
  readonly language: string;
  /** Managed publications freeze display metadata and runtime with the content hash.
   * Existing repository revisions omit this field and keep their original hashes. */
  readonly publication?: {
    readonly metadata: Omit<ChallengeMetadata, "revision">;
    readonly runtime: {
      readonly engine: string;
      readonly version: string;
      readonly fingerprint: string;
    };
  };
  /** The file's name, as the code is run and shared under it: count_words.py. */
  readonly file: string;
  /** The file as practice opens it. */
  readonly starter: string;
  /** The function the checks call. */
  readonly entrypoint: string;
  /** Named when each case's input is a list of arguments; otherwise it is the only one. */
  readonly parameters?: readonly string[];
  /** SQL: CREATE TABLE statements run before each case. */
  readonly schema?: string;
  /** C, C++ and Java: turns a case's JSON arguments into the function's types. */
  readonly adapter?: string;
  /** Deterministic: a submission is complete when every case passes and no rule fires. */
  readonly cases: readonly Case[];
  readonly rules: readonly Rule[];
}

/** Live metadata: editable without a new revision. */
export interface ChallengeMetadata {
  /** Permanent: PY-003, the language's code and a number (packages/content/keys.ts). */
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  /** Optional: a sharper one-line invitation for shared links, such as a result card's page. */
  readonly hook?: string;
  readonly difficulty: Difficulty;
  readonly tags: readonly string[];
  /** The live revision's id. */
  readonly revision: string;
}

/**
 * What people are served: every challenge with its live revision, by id. Built from
 * content/challenges by tools/build-content.ts; in production the index and each revision
 * will be separate objects in object storage.
 */
export interface Catalog {
  readonly schemaVersion: "1.0.0";
  readonly challenges: readonly ChallengeMetadata[];
  readonly revisions: Readonly<Record<string, Revision>>;
}

/** The cases a run checks: Run examples runs the examples; Submit runs every case. */
export function casesRun<C extends { readonly hidden: boolean }>(
  cases: readonly C[],
  purpose: "examples" | "submit",
): C[] {
  return purpose === "submit" ? [...cases] : cases.filter((c) => !c.hidden);
}
