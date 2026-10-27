# Human cohorts in the report (ENG-374): implementation and security proposal

Status: **policy approved, read still disabled.** On 27 October 2026 Ekku approved (via dot) the initial comparison policy:
- at least 20 eligible distinct browser participants;
- the same challenge revision and language, under compatible conditions;
- first attempts kept separate from repeats;
- current stealth data excluded;
- under-18s never mixed with adults;
- no narrow demographic slices and no individual records.

It is a conservative product floor, not a statistical guarantee. The implementation below enforces it.

`COHORTS_ENABLED` stays `false` in `packages/statistics/cohort.ts` until root has reviewed this player-facing read and the release steps below are done. Until then the route answers `{ state: "disabled" }` without running SQL, and the report makes no cohort request.

## What a player sees

Chapter 4's People column, per challenge the player tried, shows one of these:
- **A matched group:** "80% solved · median 2 submissions".
- **A group that was checked and is too small:** "fewer than 20 comparable people".
- **No recorded conditions:** "your conditions weren't recorded".
- **A failed read:** "can't be read".

Never a nearest group, a pooled total, a percentile of one person, or a zero. Edit habits (chapter 3) and time are not compared in this version.

## Infrastructure: nothing new

| Item | Choice |
| --- | --- |
| Caller | Existing web Worker `muscle-memory`, route `GET /api/cohort/<key>/<revision>` |
| Data | Existing `default.events` (Basin SQL over the events catalog), the same table admin statistics and private history read |
| Credential | Existing `ADMIN_STATS_SQL_TOKEN` in web, unchanged. No new token, binding, service, store or permission |
| Registry | Existing `CATALOG_DB` (`published_versions`), to refuse unpublished and `synthetic-qa` revisions |
| Gate | Current Terms cookie; the revision must be a registered public one. The route takes no participant ID, filter, demographic or SQL |

## Matching keys and unit

- **Group key:** exact `challenge` + `challenge_revision` (which fixes the language), the attempt's recorded runtime (`practice.opened.runtime`, exactly as uploaded), whether type diagnostics were on, and first vs repeat.
- **Excluded attempts:** those with more than one runtime, or with no recorded start.
- **One attempt per browser per group:**
  - *first:* a browser's earliest started attempt, if it wasn't started as "again".
  - *repeat:* that browser's earliest later attempt.
  - A browser therefore counts at most once in "first" and once in "repeat", never twice in the same group.
- **What's counted:** distinct browser IDs, not people. One person with two browsers counts twice; the notice already describes participants as browser IDs.

## Exclusions, applied before counting

- **Deduplication:** records are deduplicated by `record_id`. A record with conflicting copies is dropped.
- **People only:** only `actor = person`, so model runs never fill a human group.
- **Stealth and 16–17:** a browser is excluded when its **latest** uploaded `site.profile` says `stealth: true` or `age: 16-17`. Turning stealth on removes all of that browser's history from every group at the next refresh.
  - **Under-18s:** browsers that declared 16–17 are excluded from every group, so they are never mixed with adults. A separate 16–17 cohort is not built.
  - **No age answer:** age is optional, and these browsers are counted. The Terms require 16 or older, so an unanswered browser may still be 16–17. Every read states this in its `eligibility` field, and the report's details repeat it. Excluding unanswered browsers too would be stricter but would make groups much smaller; that is root's call.
- **Deletion:** erasure removes a deleted browser's rows daily at 03:17 UTC. A browser can therefore remain inside a ≥20 aggregate for up to about 25 hours after deletion (erasure lag plus the 1-hour cache). Closing that gap would mean extending the approved `ParticipantOwner` RPC with a read-only "deleted IDs" method; that would broaden the binding, so it is not proposed unless required.
- **Synthetic QA revisions:** never a cohort.

## What is published (`CohortRead`)

```json
{ "state": "ready", "version": "cohort-1", "minimum": 20, "readAt": "…",
  "eligibility": { "unit": "distinct browsers, not people", "ages": "declared 16–17 excluded; no age answer included",
    "stealth": "excluded by each browser's latest uploaded privacy setting", "attempts": "one first attempt and, separately, one repeat per browser" },
  "groups": [{ "runtime": {"engine": "javascript", "version": "…"}, "diagnostics": false,
    "practice": "first", "participants": "20–49", "solved": 0.8, "firstTry": 0.35,
    "submissions": { "p25": 1, "p50": 2, "p75": 4 } }] }
```

- **Group size:** `participants` is a band (20–49, 50–99, 100–249, 250+), never an exact count.
- **`solved`:** share of the group that finished.
- **`firstTry`:** share whose first submission passed every check with no fired rule. Null unless at least 20 browsers submitted.
- **`submissions`:** nearest-rank quartiles of submissions among finishers. Null unless at least 20 finished.
- Shares are rounded to 5%.
- SQL returns only value counts: (runtime, diagnostics, practice, completed, first-pass, submissions) → number of browsers. The Worker turns these into the fields above and discards them. No participant ID, attempt, record or payload leaves SQL or the Worker.

## Small cells and differencing

- **Floor:** every published figure rests on at least `MIN_COHORT` = 20 distinct browsers (proposed; awaiting approval). Smaller groups are dropped entirely, and their existence isn't reported.
- **Fixed partition, no totals:** the only cuts are runtime × diagnostics × first/repeat. No total across groups is published, so one figure can't be subtracted from another to isolate a smaller group.
- **No demographic slices:** no experience, country or role cuts in v1.
- **Over time:** bands, 5% rounding and an hourly refresh blunt "one more person joined" inference across snapshots. A caller can't choose its own cuts, time windows or filters. This is suppression plus rounding, not formal differential privacy.

## Freshness and cost

- **Cache:** one query per revision per hour per isolate, held in memory (at most 64 revisions). Duplicate requests share one in-flight query, and at most two uncached queries run at once.
- **Request:** 15-second timeout and a 1 MiB response limit. On failure the Worker returns its last cached result if it has one, otherwise "unavailable". It never logs or returns SQL error text.
- **Cost:** each query scans one revision's events plus profile events, at Basin's 10 MB minimum or more.
- **Client:** the report requests at most three revisions, the same ones as chapter 4's model results, and makes no request at all while cohorts are disabled.

## Verification

`packages/statistics/cohort.test.ts` runs the actual fixed SELECT in SQLite on synthetic browsers. It covers:
- the 20 floor: 19 browsers are withheld, 20 are shown;
- stealth set on a profile, and later turned off again (the latest profile wins);
- 16–17-year-olds excluded;
- duplicate copies counted once and conflicting copies dropped;
- model actors kept out of human groups;
- first and repeat attempts kept apart, one per browser;
- other revisions kept out;
- injection-shaped IDs refused;
- no identifiers in the output;
- exact matching of runtime, diagnostics and first/repeat.

`apps/web/lib/report.test.ts` covers every People cell state.

**Before enabling,** run the query once through the authenticated SQL workbench on a synthetic revision. SQLite does not prove that DataFusion can plan it (the ENG-340 history query taught this), and `json_get_json` output formatting (`'[]'`, `'true'`) must be confirmed against Basin.

## Remaining before enabling

1. **Policy (approved):** the floor, matching, first/repeat split, stealth and under-18 rules above. Still open:
   - whether browsers with no age answer stay included, as implemented and disclosed;
   - the ~25-hour deletion lag (or approval to extend the ownership-check RPC with a deleted-IDs read).
2. **This player-facing read (root review):** web's existing `ADMIN_STATS_SQL_TOKEN` would run fixed aggregate queries when players visit. This adds no new credential, binding, token scope or persistent store; the only state is in-memory cache.
3. **A Privacy Notice version** saying comparisons with people are live, replacing "Human comparisons remain unavailable…".

Enabling: set `COHORTS_ENABLED = true`, run the workbench check, deploy. Disabling is the reverse, and nothing is stored.
