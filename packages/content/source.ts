/** Authoring/model tools read the same private managed copy; no repository-folder fallback. */
import { readCatalogCopy } from "./copy";
import type { ChallengeMetadata, Revision } from "./model";

/** What a challenge's private folder holds: whole files, never published. */
export interface Private {
  /** A correct solution: it must pass every case and fire no rule. */
  readonly solution: string;
  /** Other correct designs: each must pass every case and fire no rule. */
  readonly alternatives: readonly string[];
  /** Plausible mistakes: each must fail at least one case. */
  readonly wrong: readonly string[];
  /** Per rule: code that must fire it, and code that must not. */
  readonly examples: Readonly<
    Record<string, { fires: readonly string[]; quiet: readonly string[] }>
  >;
}

export interface ChallengeSource {
  readonly metadata: Omit<ChallengeMetadata, "revision">;
  readonly revision: Revision;
  readonly private: Private;
}

/** Resolve an exact published key from the private managed copy. */
export function readChallenge(key: string): ChallengeSource {
  const source = readChallenges().find((s) => s.metadata.key === key);
  if (!source)
    throw new Error(
      "Challenge is not present in the published managed catalog copy.",
    );
  return source;
}
export function readChallenges(): ChallengeSource[] {
  return readCatalogCopy().sources;
}
