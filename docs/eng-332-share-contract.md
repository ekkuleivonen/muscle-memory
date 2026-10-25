# ENG-332 sharing contract: challenges, solutions and outcomes

**Status: implemented on this branch, for dot's combined review and release (ENG-327).** It covers:

- challenge links;
- v3 outcome cards (dot-approved fields);
- v2 legacy reading;
- one-file solution sharing;
- selected hooks pinned to exact revisions;
- the shared-card capture contract.

No capture version, event shape, collection, consent or telemetry change. ENG-328 owns the completion writer and capture versions and mounts `ShareOutcome` (see the integration hunks below).

## Challenge links, legacy cards and solution code

- **Challenge link, `/try/<KEY>`.**
  - The page shows the goal and requirements, then the published examples labelled Input and Expected output. This is the same shape as ENG-328's `ChallengeExamples`, which can replace the inline markup when composed.
  - Only `visible` cases are shown. The checks beyond them stay hidden, as in practice.
  - There's no "ticket", "tracker", "repo" or "real bug" wording.
  - It has its own preview image (`try/[key]/opengraph-image.tsx`) showing the challenge, its language, and its selected hook or one-line goal.
  - Starting still records the same `start-work` move.
  - The copy button now says "Copy challenge link".
- **Legacy outcome link, `/r/<card>` with a version 2 card (unchanged format).**
  - The headline names the challenge. It says completed and the checks passed, never "without AI" as a fact.
  - Legacy `fp`/`fn` still decode but are not displayed.
  - A v2 card was made at a merge, so it reads **completed** with its checks, or "not completed" if its evidence says it wasn't merged.
  - PR-era numbers keep their values but use challenge terms: pushes become "full checks run", first submission becomes "first full check", CI-only checks become "checks beyond the examples", and local runs become "example runs".
  - Hints and open findings appear only when a card has some.
  - A v2 card has no revision identity, so it always offers "Try the current version of <KEY>".
- **Solution code.**
  - The encoding format (v1), the all-or-nothing rule, the UTF-8 size limits and the opt-in, unticked by default, are unchanged.
  - One checked file is the normal case: the share dialog names it, and the reader shows it as "their solution".
  - Links from multi-file challenges decode exactly as before, and every file is shown in full.
  - If the checked artifact is missing or truncated, ticking the box shows a refusal. The editor's current code is never shared in its place.
- **Older, malformed and retired links** keep their honest pages, in challenge wording.

The legacy sender (`ShareResult`, v2) is still mounted by the merged pull request in `pulls.tsx`, which is ENG-328/329 territory and isn't touched here.

## Outcome card version 3 (approved by dot, implemented)

`apps/web/lib/outcome.ts` holds the serializer (`encodeOutcome`), parser (`decodeOutcome`), allowlist (`publicOutcome`), builder (`outcomeOf`) and wording (`outcomeSentence`, `outcomeLines`). Tests are in `lib/outcome.test.ts`.

| Field    | Meaning                                                                                                                                                                                                                                                                                                                                                                                                |                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `v`      | `3`                                                                                                                                                                                                                                                                                                                                                                                                    | required                   |
| `k`, `l` | Challenge key, language                                                                                                                                                                                                                                                                                                                                                                                | required                   |
| `rv`     | The checked revision's full sha256 (64 hex, no prefix form)                                                                                                                                                                                                                                                                                                                                            | required                   |
| `o`      | The final full check, `{ passed, total }`: every check passed                                                                                                                                                                                                                                                                                                                                          | required                   |
| `f`      | The first full check of the attempt, `{ passed, total }`, only when its raw terminal run was scored completely (completed in the tests phase, every case returned an untruncated output or raised); `null` otherwise: compile error, timed out, runner error, cancelled, partly executed, cut-short output, never reported, or a different suite size. Synthesized summary counts (0/N) are never used | optional                   |
| `n`      | Full checks started in the attempt through the completing run and not cancelled as of the completion                                                                                                                                                                                                                                                                                                   | optional                   |
| `c`      | Referral code: the existing referral mechanism (`/r` notes the arrival; `shared.ref` joins it), nothing more                                                                                                                                                                                                                                                                                           | required by that mechanism |

- **Source.** Built only from a recorded `checks-passed` completion (`automatic: true`, ENG-328's `completions()`, board capture 7.2.0) and the `observation.workspace.pull-request` full-check records before it, in the same attempt, on the same revision. `o` must be the completing run's recorded result, `checks-passed` with `total > 0` and `passed = total`, and that run's raw outcome must be completely scored. The gate's required deterministic rules for that run's code must have been evaluated, with none outstanding (the `required` input). Otherwise there is no card. A legacy merge never becomes v3, and no v2 merge is invented for a new completion. Every fact is read as of the recorded completion time: records after it (a late result, error or cancellation of an overlapping earlier run) never change the card, and a run still going then keeps its place with an unknown result. Nothing is recomputed and nothing new is collected.
- **Never in v3:** `e`, `g`, `t`, `fp`, `fn`, ranks, comparisons, timing, speed, keystrokes, hints, findings, file paths or code. The parser refuses any other field, a final check that didn't pass everything, a first check with a different total, a malformed revision, key or referral code.
- **Wording:** "Completed “<title>” (<KEY>) in <language>. All <n> checks passed." The sharer's own text says "I completed …". There is no "without AI" anywhere generated: the page describes the editor's lack of AI features as a practice condition, not proof about other tools. If the card's revision isn't the live one, the page says it was completed on an earlier version and that the visitor starts from the current one.
- **Version honesty:** "Try <KEY> yourself" and "the same starting code they did" appear only when the card's full revision is the live one. A v3 card on an earlier revision, and every v2 card (no revision identity), says "Try the current version of <KEY>" and "the challenge's current starting code". Unavailable older links say the same.
- **Bounds:** v3 has its own strict parser. The segment is at most 1024 base64url characters. Only the listed fields are allowed. Key, language, revision and referral code must match exact patterns. Counts are integers within limits (checks ≤ 10,000, `n` 1–100,000), and `f.total` must equal `o.total`. It never reuses or coerces the v2 decoder.
- **v2:** still decodes and renders in challenge terms. Its sentences no longer say "without AI", and `fp`/`fn` still decode but are never displayed.
- **Code:** unchanged v1 fragment, explicit unticked opt-in, the same UTF-8 limits and exact read-back. `ShareOutcome` offers exactly the completing run's checked artifact (one file for normalized challenges). If that artifact is missing or truncated, ticking refuses it. The editor's current code is never used in its place. Old multi-file links still read back whole.

## Integration hunks for ENG-328 (single writer, capture owner)

1. **Mount** (practice area, after a current verified completion; `ide.tsx` is not edited here):

   ```tsx
   <ShareOutcome
     challenge={{ key, slug, title, revision, language }}
     completion={completions(records, slug).at(-1) ?? null}
     required={/* the gate's outstanding required rules evaluated for that completion's run: [] when satisfied, null if not evaluated */}
     records={records}
     revisions={revisions}
   />
   ```

   It renders nothing unless that completion is `automatic`, names this challenge, is on the open revision, and `required` is `[]`. Please supply `required` from the gate evaluated for the completing run's artifact. Today's `completionEligibility` returns `required: []` on early failures too, so pass `null` unless the gate reached rule evaluation for that `runId`.

2. **Shared event card JSON: no capture version change.** `observation.board.shared.card` is opaque JSON that names its own version (`card.v`: 2 for a merged pull request's card, 3 for a completed challenge). `boardShare` validates only `issueKey`, `channel` and `ref`, and ingest never reads the card. So a v3 card is recorded under whatever board capture version is current (7.2.0 with ENG-328), and ENG-332 asks for **no** board capture bump. A global bump would risk hiding new completions, because `completions()` and ingest pin `checks-passed` to exactly 7.2.0. No reader of `shared.card` exists in `tools/`, `apps/ingest` or the aggregates. ENG-328 adds this to the same, not-yet-released 7.2.0 comment in `packages/domain/board.ts` (no new version): "`shared.card` may be a version 3 outcome card (`apps/web/lib/outcome.ts`: v, k, l, rv, o, optional f and n, c), shared after a `checks-passed` completion; the card carries its own version, and version 2 cards keep their meaning." It also keeps the composed reader test below in the integrated tree.

   Coverage is in `apps/web/lib/share-capture.test.ts`:
   - A v3 card is recorded under the current board version unchanged, and ingest accepts it.
   - Shares queued under every older accepted board version (with v2 or v3 cards) are still accepted, and an unaccepted version is still refused.
   - Composed with ENG-328, a `checks-passed` completion stays visible in `completions()` beside a v3 share, and a legacy merge queued under 7.1.0 is still accepted and read. On this branch alone that test skips, because `completion.ts` isn't present. It was verified on a scratch merge of PR40 `794d404` with this branch: tsc clean, `npm test` 256/256 with nothing skipped. Since ENG-332 emits no new version, nothing waits on ingest being live first.

## Selected hooks (dot, 2026-10-25), revalidated

Dot selected B / SHOP-5, C / DATA-6 and D / API-8 as primaries, and A / QUICK-2 as the low-friction starter. E / FN-5 stays in reserve. The ENG-331 inventory (PR #41) is pinned to the old baseline, so each hook was rechecked against ENG-329's single-file normalization, `content/catalog.json` at `7c09d35` (PR #38), and again at its latest head `3719e600d2419617d71a018deae7fa389282fc27`. All four revision objects are identical between the two (only SHOP-8 and DATA-8 changed). ENG-331's updated register (PR #41 at `790fd6f`) pins the same four revisions. No baseline revision claim is carried over.

| Key     | Revision (`7c09d35` = `3719e60`)                                          | Was (baseline)  | Cases (visible) | Payoff change                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------- | --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QUICK-2 | `sha256:55f86f1b8bf7069f92738a17e5839b45269fd3214ac6f47cac5458ec49f7f394` | `8a7ed6dc808d…` | 19 (5)          | None to the hook. The body now spells out carriage returns, punctuation and lone symbols as words.                                                                                                                 |
| SHOP-5  | `sha256:68ed6a0dcc9d8270bef73e4ac44602d6e2e5d35d4d634bb08402aa437b672254` | `c4b28311be0a…` | 17 (3)          | None to the hook ($45 paid, $40.50 refunded, still in the body). The helpers' API is stated inline. "Leave `orderTotal` as it is" is now a stated requirement, still enforced by `ada-order-total`.                |
| DATA-6  | `sha256:de8621e616e78cb42b58d2d189a0b9738171c3345ef3193d1af425130e4ba130` | `7a455c4e6461…` | 15 (5)          | None to the hook (Northwind overstated, Corvid missing). The schema is in the body. "Every payment counts" is a stated requirement, enforced by `priya-sum-distinct`.                                              |
| API-8   | `sha256:a7d434b1858edc7bc26cd2fbf95f53959221cd9cf5e7ea33afff7cdecd0a2c59` | `62924f856e62…` | 19 (5)          | None to the task. The hook is now ENG-331's “Fix duplicate sign-ups without treating every email provider like Gmail.” The earlier “two different people?” line implied an identity question the task doesn't ask. |

Each challenge has one editable entry in that revision. The hooks live in `apps/web/lib/hooks.ts`, each pinned to the revision above. They are shown on `/try/<KEY>`, in its preview image and metadata, and in the shared outcome page's "Your turn", only while that exact revision is live. On any other revision, including this branch's baseline catalog and any later ENG-329 review fix, the page falls back to the challenge's own title and summary. If ENG-329 changes one of these revisions again, the hook must be rechecked and its pin updated. It is not carried over automatically. The hooks name the problem, not an approach. QUICK-2 uses the neutral wording, not the optional AI-use variant. B/C/D are plain challenge prompts and A is the starter, worded exactly as in ENG-331's register. First-person identity, craft or debate lines (I, K) are optional campaign drafts for a real person to adopt. They are never put into share cards, previews or generated text, and nothing is posted.
