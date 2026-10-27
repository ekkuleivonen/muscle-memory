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
| Data and credential | One fixed SELECT (`cohortQuery`) over the existing `default.events`, using web's existing `ADMIN_STATS_SQL_TOKEN`. No new token, binding, scope, service or stored data |
| Output of SQL | Value counts only: (runtime, diagnostics, first/repeat, finished, first try passed, submissions) → number of browsers. No ID, attempt, record or payload leaves SQL or the Worker |

## Response (`CohortRead`)

| Field | Meaning |
| --- | --- |
| `state` | `disabled`, `ready`, `unavailable`, or `earlier-version` |
| `version`, `minimum`, `readAt` | `cohort-1`; 20; when the query ran |
| `eligibility` | Who was counted, in words (below) |
| `groups[]` | One per runtime × diagnostics × first/repeat, with at least 20 eligible browsers |

Each group has:
- `participants`: a band (20–49, 50–99, 100–249, 250+), never an exact count;
- `solved`: share that finished, rounded to 5%;
- `firstTry`: share whose first submission passed every check with no rule fired, rounded to 5%;
- `submissions`: `p25`, `p50` and `p75` of submissions among finishers.

`firstTry` and `submissions` are null unless their own subset also has at least 20 browsers. Groups below 20 are omitted without trace. No total across groups is published, so no figure can be subtracted from another to isolate a small group.

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

## Proposed fix before activation (not implemented; needs root's exact approval)

The smallest change that reuses existing pieces (the ingest Worker, its CONTROL bucket, device-secret proofs and the approved `PARTICIPANT_OWNER` service binding) and adds no new service, store or credential:

1. **Authoritative current eligibility, written with the device secret.**
   - New ingest route: `POST /ingest/v1/participants/<id>/privacy`, body `{ secret, stealth, adult }`.
   - `adult` is `true` only for a stated 18+ band, `false` for 16–17, and `null` when unanswered.
   - It verifies the secret against the existing proof, the same way deletion does, refuses after a tombstone and is rate-limited per participant.
   - It writes CONTROL `privacy/<id>` = `{ stealth, adult, at: <server time> }` and bumps CONTROL `privacy/epoch` to the server time.
   - Deletion also bumps the epoch.
   - The browser sends it whenever stealth or age changes, and once to sync the current state. No new answers are collected; these are the same answers already uploaded, now with a server-ordered current value.
2. **A bounded internal eligibility check on the existing binding.** Two new methods on the `ParticipantOwner` entrypoint, both read-only with no mutations:
   - `epoch()` returns the epoch.
   - `eligible(ids)` takes at most 1,000 IDs and returns only those with no tombstone and a privacy record of `{ stealth: false, adult: true }`. Missing, unknown or malformed records count as **not eligible**.
3. **Cohort read uses it.**
   - SQL returns per-browser outcome rows for the one revision: the pseudonymous browser ID plus the outcome fields, capped at 1,000 browsers, above which the result is unavailable.
   - The web Worker asks `eligible(ids)`, aggregates only the browsers it returns, applies the 20 floor and drops the IDs from memory.
   - The rows are cached (1 hour, per isolate) together with the epoch.
   - **Every** request first calls `epoch()`, one CONTROL read. If the epoch changed, the Worker re-checks `eligible` on the cached rows and re-aggregates before answering.
   - A cached aggregate therefore never includes someone who has since gone stealth, become ineligible or been deleted, once their write is acknowledged.
   - If a group falls below 20 it disappears, and the player sees "fewer than 20 comparable adults". It is never kept at a stale size.
4. **Bounds and cost.**
   - Per uncached query: one SQL scan, plus up to 2,000 CONTROL reads (a tombstone and a privacy record per browser).
   - Per request: one CONTROL read.
   - The existing per-participant rate limiter covers the privacy write.
5. **What still isn't covered.**
   - A stealth change made offline counts only once its privacy write reaches ingest. The report and settings would say "pending" until it has been acknowledged.
   - Browsers that never sync a privacy record are never counted.
   - Requires a Privacy Notice version describing the stored current privacy state.

Approvals this needs, none granted yet:
- the new ingest route and CONTROL keys;
- the two new `ParticipantOwner` methods;
- web passing browser IDs to `eligible`;
- the notice version.

## Cost: actual bounds

| Bound | Value |
| --- | --- |
| Distinct keys | One per published challenge: 69 today |
| Per isolate | One query per key per hour; at most 2 running at once; in-flight requests coalesced; 15 s timeout; 1 MiB response |
| Per query | Basin's 10 MB minimum or more |
| Worst case | 69 queries per hour **per isolate**, which is not a global cap: Cloudflare can run many isolates. A global cap would need a shared limiter (for example a Workers rate-limit binding), which is new configuration and not proposed |
| Client | At most 3 revisions per report, and only when enabled |

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
