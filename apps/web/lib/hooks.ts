/**
 * Dot's selected share hooks: plain, short challenge prompts, worded as in ENG-331's register
 * (PR #41 at `790fd6f`). B / SHOP-5, C / DATA-6 and D / API-8 are the primaries; A / QUICK-2 is
 * the low-friction starter. A hook describes the challenge, never a person: no first-person
 * identity, craft or debate lines (those are optional campaign drafts for a real person to
 * adopt), no approach, root cause or hidden case.
 *
 * Each hook is pinned to the exact revision it was checked against: ENG-329's normalized
 * catalog at `3719e60` (unchanged for these four since `7c09d35`). It shows only while that
 * revision is live; any other revision gets the challenge's plain title and summary.
 */
export interface Hook {
  /** The revision the hook was checked against. */
  readonly revision: string;
  readonly text: string;
}

export const HOOKS: Readonly<Record<string, Hook>> = {
  // Starter, not the flagship: the low-friction warm-up.
  "QUICK-2": {
    revision:
      "sha256:55f86f1b8bf7069f92738a17e5839b45269fd3214ac6f47cac5458ec49f7f394",
    text: "An empty post says “1 word.” Can you make the count match the text?",
  },
  "SHOP-5": {
    revision:
      "sha256:68ed6a0dcc9d8270bef73e4ac44602d6e2e5d35d4d634bb08402aa437b672254",
    text: "They paid $45 for the jacket. The refund is $40.50. Make the refund match the receipt.",
  },
  "DATA-6": {
    revision:
      "sha256:de8621e616e78cb42b58d2d189a0b9738171c3345ef3193d1af425130e4ba130",
    text: "The payment report overcounts one partner—and leaves out the one who paid nothing. Fix the SQL.",
  },
  "API-8": {
    revision:
      "sha256:a7d434b1858edc7bc26cd2fbf95f53959221cd9cf5e7ea33afff7cdecd0a2c59",
    text: "Fix duplicate sign-ups without treating every email provider like Gmail.",
  },
};

/** The hook for a challenge's live revision, or null: then use its title and summary. */
export function hookFor(issue: {
  key: string;
  revision: string;
}): string | null {
  const hook = HOOKS[issue.key];
  return hook && hook.revision === issue.revision ? hook.text : null;
}
