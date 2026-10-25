/**
 * Dot's selected share hooks: plain, short challenge prompts, worded as in ENG-331's register
 * (PR #41 at `790fd6f`). B / JS-005, C / SQL-002 and D / GO-005 are the primaries; A / JS-002 is
 * the low-friction starter. A hook describes the challenge, never a person: no first-person
 * identity, craft or debate lines (those are optional campaign drafts for a real person to
 * adopt), no approach, root cause or hidden case.
 *
 * Each hook is pinned to the exact revision it was checked against: ENG-329's normalized
 * catalog at `3719e60` (unchanged for these four since `7c09d35`), re-pinned when keys became
 * language-based to revisions that differ from those only in the key they name. It shows only
 * while that revision is live; any other revision gets the challenge's plain title and summary.
 */
export interface Hook {
  /** The revision the hook was checked against. */
  readonly revision: string;
  readonly text: string;
}

export const HOOKS: Readonly<Record<string, Hook>> = {
  // Starter, not the flagship: the low-friction one.
  "JS-002": {
    revision:
      "sha256:a76073b87ea827b10fa10d7b0967983168214109f5499005e477a66357c5bfa8",
    text: "An empty post says “1 word.” Can you make the count match the text?",
  },
  "JS-005": {
    revision:
      "sha256:ddabe0acdc65d863360f33749be7bbf4078de2160e0c10f1cea3ef58f2264894",
    text: "They paid $45 for the jacket. The refund is $40.50. Make the refund match the receipt.",
  },
  "SQL-002": {
    revision:
      "sha256:40599a34c8ebd1cd1aef4ace91928ac3fd378f92c1bbcae0e109556cf9c1f22a",
    text: "The payment report overcounts one partner—and leaves out the one who paid nothing. Fix the SQL.",
  },
  "GO-005": {
    revision:
      "sha256:99eecb5b29c5ad9a8cc605c7a72d63f6ef9cdbec1f2cb76dbcd97a80f2858e18",
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
