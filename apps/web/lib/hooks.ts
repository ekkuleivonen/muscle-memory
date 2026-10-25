/**
 * Dot's selected share hooks (ENG-331 inventory, selection of 2026-10-25): one line that opens a
 * shared challenge link, written from the challenge's own stated problem. No approach, root
 * cause or hidden case is in a hook.
 *
 * Each hook was checked against one exact revision: ENG-329's single-file normalization
 * (`7c09d35`). It is shown only while that revision is the live one. Any other revision (the
 * earlier multi-file one, or a later edit) gets the challenge's plain title and summary, so a
 * hook never describes a problem the visitor won't get.
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
    text: "The payment report overcounts one partner and leaves out the one who paid nothing. Fix the SQL.",
  },
  "API-8": {
    revision:
      "sha256:a7d434b1858edc7bc26cd2fbf95f53959221cd9cf5e7ea33afff7cdecd0a2c59",
    text: "Two sign-ups, one email address, or two different people? Build the lookup key using the stated rules.",
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
