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

// Exported constants: AGE_FORM, PRIVACY_SETTINGS, AGE_ACTION, REVIEW_ACTION (packages/statistics/human-fyi.ts)
```

`catalog` is the web `ChallengeSummary[]` (`key`, `revision`, `title`). `viewer` is this device's
profile (`profile.age`, `stealth`, `signedOut`). Passing `undefined` reads means not requested: `off`.
The existing `report-data.ts` reads already fetch `/api/cohort/…` and `/api/model-receipts/…` per
revision; wrap each result with the pair it requested.

## Results

Both return `{ state: "shown", fyi }` or an omission. `fyi.text` is the finished sentence; the other
fields let the view link the named attempt.

### Human

`{ state: "omitted", reason, action }`, where `action` is a fixed `{ label, href }` or null:

| Reason | When | `action` | Suggested display |
|---|---|---|---|
| `off` | build switch off, not requested, stealth or signed out | null | today's note, minus "models aren't compared" |
| `age-missing` | the viewer hasn't answered age | `AGE_ACTION`: *Add your age band (optional)* → `/settings/profile/age?from=stats-comparisons` | "Comparisons with other players are between adults." |
| `not-adult` | the viewer answered 16–17 | null | nothing, and no prompt |
| `no-attempt` | no solved first attempt on a current revision with one known setup | null | "Comparisons cover first attempts on current versions" |
| `loading` | a read is in flight | null | nothing yet; personal answers never wait |
| `unavailable` | missing, expired or invalidated summary, failed request, or a read for a different revision | `REVIEW_ACTION`: *Review comparison settings* → `/settings/privacy` | nothing, or "Comparisons aren't available right now"; never stale content |
| `too-few` | a valid read with no exactly matching group of at least 20 browsers behind the metric | `REVIEW_ACTION` | "Other players' results appear once at least 20 comparable adults have played the same version" |

Stats can't see this browser's server record, so it must never say the settings are unconfirmed or
unshared; `REVIEW_ACTION` is deliberately neutral, and the settings page shows the actual state.

Shown human line, example: *On Two Sum (current version, same runtime and editor setup), about 45% of
scored first submissions passed, across first attempts from 50–99 browsers.* `browsers` is that
metric's own denominator band; browsers are counted, not verified people. Never place the player's own
first-submission result beside it: the report scores compile and runtime errors, the cohort doesn't.

### Model

`{ state: "omitted", reason }`: `off` (not requested, stealth, signed out), `no-attempt`, `loading`,
`unavailable` (no stored results readable), `unmatched` (no finished run with the same runtime and
diagnostics setting).

Each model counts once: its first provider-default try, failures included; conflicting duplicates
drop that model. Queued, running, missing, incompatible and infrastructure-failed runs are left out,
never counted as failures. There is no minimum number of models: these are observed runs, said as such.

```ts
ModelFyi = { kind: "code-length" | "outcome"; attempt; challenge; title; revision;
             runs: { model; outcome: "solved" | "stopped" | "budget" | "refused" | "error"; codeLength: number | null }[];
             solved; ran; yours: number | null; modelLength: number | null; lengthRuns: number; text }
```

`code-length` needs the player's local passing-code length and at least one solving run with recorded
code; otherwise `outcome`. Examples:

- one run, code length: *On Two Sum (current version, same runtime and diagnostics), your passing code
  was 412 characters; acme/model-x solved it on its first try at its default setting with 380. One
  observed run; length isn't a score.*
- one run, outcome: *…, acme/model-x ran out of its budget without solving it on its first try at its
  default setting. One observed run, not a success rate.*
- several, code length: *…, your passing code was 412 characters; 5 of 7 models solved it on their first
  try at their default setting, with a median of 380 across those 5 solving runs. Length isn't a score.*
- several, outcome: *…, 4 of 6 models solved it on their first try at their default setting. One try
  each, not a success rate.*

Human submissions and time are never compared with models. When both lines are omitted, say why from
the reasons above rather than claiming comparisons are impossible.

## How a player becomes countable

Nothing is backfilled from uploads and nothing enrolls in the background.

- **Age not answered:** `AGE_FORM` = `/settings/profile/age?from=stats-comparisons`. Saving an adult
  band sends this browser's comparison settings (conditional create) and the page shows the server's
  confirmation; **back to your report** returns to `/stats`.
- **Adult answered before activation:** `PRIVACY_SETTINGS` = `/settings/privacy` shows *Not shared yet*
  with **use these settings for comparisons** (the existing explicit review action). Saving an age answer
  or a stealth choice also sends the settings; opening a page, focus and retry never do.
- **Going stealth or leaving it:** `/settings/privacy`, same write.
- A browser is known to the server only after its first practice upload. A save before that stays
  pending, says that even an online browser may be waiting for that upload, and offers the existing
  manual retry; nothing retries or enrolls automatically.

Counting then starts with the next hourly summary build.

**Eligibility is CONTROL state alone.** The member query no longer reads uploaded profile records
(PR71's prefilter is removed): an old, missing or conflicting uploaded profile can neither exclude nor
admit a browser. Only an acknowledged adult, non-stealth CONTROL record without a tombstone counts;
missing, pending, unknown, 16–17, stealth and deleted states are excluded. So an adult who saves
settings counts for every current revision, whenever the revision was published.

**Known limit (open decision):** an exact build checks at most 100 distinct browsers against CONTROL
(`MAX_COHORT_MEMBERS`, the `check()` bound). A revision with more browsers in its window builds no
snapshot at all, so the most played challenges show no human line and the 100–249 and 250+ bands are
not reached yet. This fails closed. Raising it means batching `check()` calls, at roughly six CONTROL
reads per member per build, which is a cost decision before activation.
