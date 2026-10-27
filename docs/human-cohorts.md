# Human cohorts in the report (ENG-374)

**Policy approved** by Ekku on 27 October 2026, via dot:
- at least 20 eligible distinct browser participants;
- the same challenge revision and language, under compatible conditions;
- first attempts kept separate from repeats;
- current stealth data excluded;
- under-18s never mixed with adults;
- no narrow demographic slices and no individual records.

It is a conservative floor, not a statistical guarantee.

**Access still disabled.** `COHORTS_ENABLED = false` in `packages/statistics/cohort.ts`. The route answers `{ state: "disabled" }` without running SQL, and the report makes no request. It must stay off until current privacy state is authoritative (below). The report can ship without it, with comparisons with people honestly marked unavailable.

## Access

| | |
| --- | --- |
| Route | `GET /api/cohort/<key>/<revision>` on the existing web Worker. Requires the current Terms cookie. Takes no participant ID, filter, slice or SQL |
| Keys | Only each published challenge's **current** revision; any other registered revision gets `earlier-version` with no SQL. Unregistered revisions get 404. `synthetic-qa` revisions return no groups |
| Data and credential | One fixed SELECT (`cohortQuery`) over the existing `default.events`, using web's existing `ADMIN_STATS_SQL_TOKEN`. No new token or token scope; new CONTROL state and a separate RPC binding are proposed but unconfigured |
| Output of SQL | Value counts only: (runtime, diagnostics, first/repeat, finished, first try passed, submissions) → number of browsers. Browser IDs and per-browser outcomes leave SQL only into trusted web memory for current CONTROL checks; no IDs, attempts, records or payloads leave the Worker |

## Response (`CohortRead`)

| Field | Meaning |
| --- | --- |
| `state` | `disabled`, `ready`, `unavailable`, or `earlier-version` |
| `version`, `minimum`, `readAt` | `cohort-2`; 20; when the query ran |
| `eligibility` | Who was counted, in words (below) |
| `groups[]` | One per runtime × diagnostics × first/repeat, with at least 20 eligible browsers |

Each group has:
- `participants`: a band (20–49, 50–99, 100–249, 250+), never an exact count;
- `solved`: share that finished, rounded to 5%;
- `firstTry`: share whose first submission passed every check with no rule fired, rounded to 5%;
- `submissions`: `p25`, `p50` and `p75` of submissions among finishers.

`firstTry` and `submissions` are null unless their own subset also has at least 20 browsers. Groups below 20 are omitted without trace. No total across groups is published. Rounding and thresholds reduce disclosure risk but do not guarantee anonymity; results can change at rounding boundaries.

## Eligibility: positive, never assumed

A browser counts only when its **latest uploaded `site.profile`** meets all of these:
- it states an adult band: 18–24, 25–34, 35–44, 45–54 or 55+;
- it says `stealth: false`.

That latest profile applies to **all** of the browser's history, not just attempts recorded after it. It is the best current state SQL can see, but it is not authoritative (see below). The following are not counted:
- no uploaded profile;
- no age answer;
- a 16–17 band;
- stealth set or unrecorded;
- an earlier adult answer that was since cleared.

The 16–17 band has no cohort yet. It stays unavailable rather than being mixed with adults.

On top of that:
- only `actor = person` records with a Terms version count, and records with conflicting copies are dropped;
- an attempt counts only if it has one runtime and a start whose origin (direct, picker, again and so on) was recorded;
- *first* is a browser's earliest such attempt on the revision, if it wasn't started as "again"; *repeat* is its earliest later attempt;
- one per browser per group;
- the unit is browsers, not people.

When enabled, the report would show a single FYI on the relevant answer; the `eligibility` text stays internal.

## Freshness and invalidation: not good enough to enable

Root's privacy review found that the uploaded `site.profile` is not authoritative current privacy state:
- an upload can be delayed indefinitely, for example offline, or a tab closed before the outbox drains;
- its `occurred_at` and `record_id` are client values, not a server sequence;
- deletion tombstones live in the ingest Worker's CONTROL bucket, which this query cannot see, and erasure is a separate daily job.

There is therefore **no guaranteed bound** on how long a browser that went stealth, became ineligible or was deleted could still be counted. Cohorts must stay disabled until the change below is in place.

**Fixed in this draft:** a browser with any conflicting `site.profile` copy is excluded entirely (fail closed). It never falls back to an older eligible profile. Covered by the SQLite and DataFusion checks.

## ENG-376 draft, authority and activation blockers

The obsolete epoch/cache proposal is replaced by [the exact ENG-376 approval proposal](eng-376-current-privacy.md). Neither new persistent privacy writes nor the internal member-check service binding is approved/configured. `ParticipantOwner.verify` remains unchanged. Cohorts stay off.

The draft uses original-secret-authorized conditional privacy writes in CONTROL, separate internal `ComparisonEligibility.check`, member IDs restricted to trusted server memory, two uncached checks and no aggregate cache. Missing/unknown/non-adult/stealth/deleted members fail closed. There is no 25-hour exclusion promise and erasure is not the exclusion mechanism. The authorization-point contract and conditional generation fence are now implemented in disabled draft code. Earlier-authorized responses may arrive later. Live authority, independent review, native Basin validation and scheduled artifact serving remain gated; lookup tests alone are not activation approval.

The draft caps unique members at 100, SQL rows at 1,000, SQL response streaming at 1 MiB, with a 15-second fetch deadline and up to 600 CONTROL reads for two passes during precomputation. Page requests never run this SQL; serving requires an aggregate-only hourly artifact and conditional current-generation authorization. Web allows two concurrent queries and one query per revision per minute **per isolate**, not a global spending cap. Exact configuration, storage fields, callers, browser integration work, native Basin verification and date-window/tool-compatibility gates are listed in the proposal.

## Engine validation

- **SQLite unit tests:** `packages/statistics/cohort.test.ts` covers the floor at 19 vs 20; stealth on and then off, latest wins; 16–17 excluded; no profile, no age, stealth unrecorded or age cleared all excluded; no Terms version and no start origin excluded; duplicates and conflicts; model actors; first vs repeat; other revisions; injection-shaped IDs; no identifiers in the output; exact condition matching.
- **DataFusion check:** `tools/cohort-query-check.ts` runs the same SELECT in **DataFusion 50.1.0** and compares the result with SQLite over synthetic scenarios: empty; eligible adults; duplicate deliveries; stealth, minors, unanswered ages and models; first and repeat. It passes locally and now runs in CI next to the history-query check. It uses Python stand-ins for Basin's JSON functions, so it proves the plan and execution, not Basin's native JSON output.
- **Before enabling:** run `cohortQuery` for one synthetic revision once through the authenticated SQL workbench. That confirms Basin's `json_get_json` returns `'[]'` and `'false'` exactly as matched.

## Enabling

1. Implement and approve the proposed fix above.
2. Root's scoped approval of this read.
3. A Privacy Notice version saying comparisons with people are live, replacing "Human comparisons remain unavailable…".
4. The workbench check above.
5. Set `COHORTS_ENABLED = true` and deploy.

Disabling is the reverse; nothing is stored.
