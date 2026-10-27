# Human cohorts in the report (ENG-374)

**Policy approved** by Ekku on 27 October 2026, via dot:
- at least 20 eligible distinct browser participants;
- the same challenge revision and language, under compatible conditions;
- first attempts kept separate from repeats;
- current stealth data excluded;
- under-18s never mixed with adults;
- no narrow demographic slices and no individual records.

It is a conservative floor, not a statistical guarantee.

**Access still disabled.** `COHORTS_ENABLED = false` in `packages/statistics/cohort.ts`. The route answers `{ state: "disabled" }` without running SQL, and the report makes no request. Enabling the player-facing read needs root's scoped approval and a Privacy Notice version.

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

That latest profile is the authoritative current state, and it applies to **all** of the browser's history, not just attempts recorded after it. The following are not counted:
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

The report shows "adults: 80% solved · median 2 submissions". Its details carry the `eligibility` text.

## Freshness and invalidation

There is no push invalidation, and an expired aggregate is never served: a failed or over-limit refresh returns `unavailable`.

| Change | When it disappears from a cohort |
| --- | --- |
| Stealth on, or age removed or set to 16–17 | Once the new profile uploads (normally minutes), at the next refresh. A cached read is at most 1 hour old |
| Account deletion | Uploads are refused at once. The browser's rows, including its profile, are erased by the daily job at 03:17 UTC, so it can remain in a group of 20+ for up to about 25 hours. Web has no read of deletion tombstones. Closing this needs a new read-only method on the approved `ParticipantOwner` RPC, which would broaden the binding; not proposed unless required |
| Group falls below 20 | Dropped at the next refresh, within 1 hour |

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

1. Root's scoped approval of this read.
2. A Privacy Notice version saying comparisons with people are live, replacing "Human comparisons remain unavailable…".
3. The workbench check above.
4. Set `COHORTS_ENABLED = true` and deploy.

Disabling is the reverse; nothing is stored.
