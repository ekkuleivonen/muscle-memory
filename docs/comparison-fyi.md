# Stats comparison lines — adapter contract (ENG-376 → ENG-394)

Stats may show at most one human line and one model line. Each names one solved attempt's
challenge and is its own line: neither is set against the report's answers across several solves.
ENG-376 owns what may be said (`packages/statistics/human-fyi.ts`, `packages/model-runs/stats-fyi.ts`);
ENG-394 alone wires them into `report.ts`, `report-view.tsx` and `stats.tsx`. Both default off and
never invent a value: anything missing is an omission with a reason.

## Inputs

```ts
// Which pairs to request (at most three, newest solved attempts on current revisions).
humanFyiCandidates(attempts, catalog): { challenge; revision }[]
modelFyiCandidates(attempts, catalog): { challenge; revision; attempt }[]

// Each read bound to the pair that was requested; a bare CohortRead can't prove its revision.
HumanCohortRead  = { challenge; revision; read: CohortRead | "loading" | "unavailable" }
ModelReceiptsRead = { challenge; revision; receipts: ModelReceipt[] | "loading" | "unavailable" }

// Numbers only, read inside the store; code never leaves it. Absent for compacted code.
PracticeStore.solvedCodeLengths(modelFyiCandidates(...)) → Record<attempt, number>

humanFyi(attempts, catalog, viewer: { age?, stealth?, signedOut? } | null, reads?: HumanCohortRead[])
modelFyi(attempts, catalog, viewer: { stealth?, signedOut? } | null, reads?: ModelReceiptsRead[], localLengths?)
```

`catalog` is the web `ChallengeSummary[]` (`key`, `revision`, `title`). `viewer` is this device's
profile (`profile.age`, `stealth`, `signedOut`). Passing `undefined` reads means not requested: `off`.
The existing `report-data.ts` reads already fetch `/api/cohort/…` and `/api/model-receipts/…` per
revision; wrap each result with the pair it requested.

## Results

Both return `{ state: "shown", fyi }` or `{ state: "omitted", reason }`. `fyi.text` is the finished
sentence; the other fields let the view link the named attempt.

| Human reason | When | Suggested display |
|---|---|---|
| `off` | build switch off, not requested, stealth or signed out | today's note, minus "models aren't compared" |
| `age-missing` | the viewer hasn't answered age | "Comparisons with other players are between adults. Add your age band (optional)" → `AGE_FORM` |
| `not-adult` | the viewer answered 16–17 | nothing, and no prompt |
| `no-attempt` | no solved first attempt on a current revision with one known setup | "Comparisons cover first attempts on current versions" |
| `loading` | a read is in flight | nothing yet; personal answers never wait |
| `unavailable` | missing, expired or invalidated summary, failed request, or a read for a different revision | nothing, or "Comparisons aren't available right now"; never stale content |
| `too-few` | a valid read with no exactly matching group of at least 20 browsers behind the metric | "Other players' results appear once at least 20 comparable adults have played the same version" |

Shown human line, example: *On Two Sum (current version, same runtime and editor setup), about 45% of
scored first submissions passed, across first attempts from 50–99 browsers.* `browsers` is that
metric's own denominator band; browsers are counted, not verified people. Never place the player's own
first-submission result beside it: the report scores compile and runtime errors, the cohort doesn't.

| Model reason | When |
|---|---|
| `off` | not requested, stealth or signed out |
| `no-attempt` | no solved attempt on a current revision with one known setup |
| `loading` | a read is in flight |
| `unavailable` | no stored model results could be read for the candidates |
| `unmatched` | results exist, none with the same runtime and diagnostics setting |
| `too-few` | fewer than three matched models |

Shown model lines: `kind: "code-length"` when the player's local passing-code length and at least three
matched solving models exist — *On Two Sum (current version, same runtime and diagnostics), your passing
code was 412 characters; the 5 models that solved it at their default setting wrote a median of 380.
Counts include whitespace; length isn't a score.* Otherwise `kind: "outcome"` with at least three matched
finished runs — *…, 4 of 6 models solved it on their first try at their default setting. One try each,
not a success rate.* Each model counts once (first provider-default try, failures included, conflicting
duplicates dropped). Queued, missing and incompatible runs are never counted as failures. Human
submissions and time are never compared with models.

When both lines are omitted, say why from the reasons above rather than claiming comparisons are
impossible.

## How a player becomes countable

Nothing is backfilled from uploads and nothing enrolls in the background.

- **Age not answered:** `AGE_FORM` = `/settings/profile/age?from=stats-comparisons`. Saving an adult
  band sends this browser's comparison settings (conditional create) and the page shows the server's
  confirmation; **back to your report** returns to `/stats`.
- **Adult answered before activation:** `PRIVACY_SETTINGS` = `/settings/privacy` shows *Not shared yet*
  with **use these settings for comparisons** (the existing explicit review action).
- **Going stealth or leaving it:** `/settings/privacy`, same write.
- A browser is known to the server only after its first practice upload; a save before that stays
  pending and says so, with a retry.

Counting then starts with the next hourly summary build.

**Known gap (open decision):** the fixed member query still keeps PR71's prefilter: the browser's
latest uploaded profile record must say adult and not stealth, and it is read within the same window
as the attempts, which starts at the revision's publication. A profile saved before a revision was
published therefore doesn't count for it until the player saves a profile answer or stealth choice
again, and the explicit **use these settings for comparisons** action uploads no profile record.
CONTROL is already the authority and fails closed, so dropping the prefilter (or reading profiles
without the publication bound) would not admit anyone CONTROL excludes; either is a SQL change and
needs a fresh bounded native run before activation.
