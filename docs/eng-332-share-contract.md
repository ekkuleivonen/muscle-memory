# ENG-332 sharing contract: challenges, solutions and outcomes

**Status: proposal for dot.** What is implemented on this branch is presentation only: no card format, link format, capture version, event or schema changed. The "Proposed" sections below need dot's decision, and the ENG-328/329 completion contract, before any of it is built.

## Implemented here (reversible presentation)

- **Challenge link, `/try/<KEY>`.** Plain and specific: goal and requirements, then the published examples labelled Input and Expected output (the same shape as ENG-328's `ChallengeExamples`, which can replace the inline markup when composed). Only `visible` cases are shown; checks beyond them stay hidden, as in practice. No "ticket", "tracker", "repo" or "real bug". It has its own preview image naming the challenge, language and one-line goal (`try/[key]/opengraph-image.tsx`, `summary_large_image`). Starting still records the same `start-work` move; nothing recorded changed. "Copy challenge link" replaces "Copy issue link".
- **Outcome link, `/r/<card>` (version 2 cards, unchanged format).** The headline names the challenge by title. A v2 card was made at a merge, the completion of the time, so it reads **completed**; **solved** only when every check it carries passed; "not completed" if its evidence says it was not merged. PR-era numbers are read in challenge terms without changing their values: pushes (each ran the full checks) → "full checks run", first submission → "first full check", CI-only checks → "checks beyond the examples", local runs → "example runs". Hints and open findings appear only when a card has some. "Production outcome" is gone; the image says the attempt is as the person shared it.
- **Solution code.** One file is the normal case: the reader shows it as "their solution", the share dialog names the file. Links from multi-file challenges decode exactly as before, and every file is shown in full. Encoding format v1, the all-or-nothing rule, the size limits and the explicit unticked-by-default opt-in are unchanged. A test pins a three-file link with CRLF and non-ASCII text reading back byte for byte.
- **Older, malformed and retired links** keep their honest pages, in challenge wording.

The sender (`ShareResult`) is still mounted only by the merged pull request in `pulls.tsx`. That is ENG-328/329 territory and is not touched here.

## Proposed: where sharing sits in the new loop

ENG-328's working area exposes a `shareControls` slot. ENG-332 supplies `ShareOutcome({ challenge, outcome, solution })`, shown only after a **recorded completion** (the verified verdict and completion record ENG-328/329 settle with dot), never after a visible-examples green or a client-side guess. `solution` is the one editable file exactly as checked (the code artifact the completing run used), or nothing when that artifact is missing or truncated, so the opt-in is refused rather than guessed. "Copy challenge link" can sit in the challenge header at any time; it never carries the attempt.

## Proposed: public outcome projection, card version 3

Built from a recorded completion only. Exactly these fields, allowlisted as `publicResult` does today:

| Field         | Meaning                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `v`           | `3`                                                                                                                                      |
| `k`, `l`, `c` | Challenge key, language, referral code (as v2)                                                                                           |
| `rv`          | First 12 hex of the checked revision's hash, for version recovery: the page offers `/try/<KEY>` and says when the live revision is newer |
| `o`           | The completing full check: `{ passed, total }` (passed = total by definition)                                                            |
| `f`           | The first full check on this attempt: `{ passed, total }`, or `null` when not known                                                      |
| `n`           | Full checks run on this attempt                                                                                                          |
| `e`, `g`      | Example runs, and which one first passed every example (0 if none)                                                                       |
| `t`           | Active time, as v2 (for the existing per-challenge comparison)                                                                           |
| `fp`, `fn`    | The existing anonymous comparison, unchanged                                                                                             |

Left out on purpose: pull request numbers, pushes, findings, hints (all retired), peak typing speed (no typing benchmark), keystrokes and typos (not outcome facts), hidden case names, inputs or outputs, file paths and code. Code stays in the fragment, format v1, one file.

Sentences: "Solved “<title>” (<KEY>) in <language> without AI. All <n> checks passed." There is no v3 sentence for anything but a completion, since a card is made only from one.

## Compatibility

- v2 cards (and the retired incident's older ones) stay readable as they are, with the wording above, indefinitely. Nothing is migrated or rewritten.
- `observation.board.shared` stores the card (`card: Json`). A v3 card changes what that field may hold, so it needs a board capture version bump with a comment saying so. Dot to approve with the completion-record change, or reject v3 and keep sharing v2-shaped facts.
- `tools/aggregates` reads `result` events, not cards: unaffected by the card version. Whether the new completion writes a `result` event is the completion owner's decision.
- No new collection, consent or legal change is needed for any of the above.

## Questions for dot

1. Approve card v3 as above (and the board capture bump for `shared`), or keep v2-shaped cards for the new completion?
2. Should outcome sharing wait for the completion record, or is the challenge link alone enough for this release? The latter needs no further change.
3. Hook wording from ENG-331: the challenge pages use each challenge's own title and summary as the fallback until dot selects hooks.

## Selected hooks (dot, 2026-10-25), revalidated

Dot selected B / SHOP-5, C / DATA-6 and D / API-8 as primaries, and A / QUICK-2 as the low-friction starter. E / FN-5 stays in reserve. The ENG-331 inventory (PR #41) is pinned to the old baseline, so each hook was rechecked against ENG-329's single-file normalization, `content/catalog.json` at `7c09d35` (PR #38). No baseline revision claim is carried over.

| Key     | Normalized live revision (`7c09d35`)                                      | Was (baseline)  | Cases (visible) | Payoff change                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------- | --------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QUICK-2 | `sha256:55f86f1b8bf7069f92738a17e5839b45269fd3214ac6f47cac5458ec49f7f394` | `8a7ed6dc808d…` | 19 (5)          | None to the hook. The body now spells out carriage returns, punctuation and lone symbols as words.                                                                                                  |
| SHOP-5  | `sha256:68ed6a0dcc9d8270bef73e4ac44602d6e2e5d35d4d634bb08402aa437b672254` | `c4b28311be0a…` | 17 (3)          | None to the hook ($45 paid, $40.50 refunded, still in the body). The helpers' API is stated inline. "Leave `orderTotal` as it is" is now a stated requirement, still enforced by `ada-order-total`. |
| DATA-6  | `sha256:de8621e616e78cb42b58d2d189a0b9738171c3345ef3193d1af425130e4ba130` | `7a455c4e6461…` | 15 (5)          | None to the hook (Northwind overstated, Corvid missing). The schema is in the body. "Every payment counts" is a stated requirement, enforced by `priya-sum-distinct`.                               |
| API-8   | `sha256:a7d434b1858edc7bc26cd2fbf95f53959221cd9cf5e7ea33afff7cdecd0a2c59` | `62924f856e62…` | 19 (5)          | None. The same stated rules.                                                                                                                                                                        |

Each challenge has one editable entry in that revision. The hooks live in `apps/web/lib/hooks.ts`, each pinned to the revision above. They are shown on `/try/<KEY>`, in its preview image and metadata, and in the shared outcome page's "Your turn", only while that exact revision is live. On any other revision, including this branch's baseline catalog and any later ENG-329 review fix, the page falls back to the challenge's own title and summary. If ENG-329 changes one of these revisions again, the hook must be rechecked and its pin updated. It is not carried over automatically. The hooks name the problem, not an approach. QUICK-2 uses the neutral wording, not the optional AI-use variant.

## Ready for ENG-328: optional sharing in practice

`ShareOutcome` (`apps/web/app/(browse)/_components/share.tsx`) is ready to mount and is not mounted here:

```tsx
<ShareOutcome
  challenge={{ key, slug, title, revision, language }}
  completion={completions(records, slug).at(-1) ?? null}
  records={records}
  revisions={revisions}
/>
```

- It renders nothing without a recorded completion for this challenge on the open revision. It does not render after a visible-examples green or a legacy merge on another revision.
- The card is the existing v2 shape: numbers up to the completion, no pull request evidence and no format change. It reads "Completed <title> (<KEY>) in <language> without AI." If dot approves v3, only the card builder changes, not the props.
- The solution is offered unticked: `solutionOf(records, runId, editablePaths)` takes the completing run's code artifact, editable files only. If that copy was truncated, sharing is refused rather than cut. If it is missing, no code option is shown.
- It records the same `observation.board.shared` event as today, with the same card shape. There is no capture change.
