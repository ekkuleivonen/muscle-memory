# Launch-only reporting (ENG-337)

**Decision.** On 28 October 2026 (04:06 UTC) the owner approved keeping all existing data and reporting launch numbers from the exact public announcement time, counting only attempts started at or after it. This is a reporting rule, not a reset. Nothing is deleted, reset or hidden: Personal Stats, raw records, challenges, model benchmarks, consent controls and comparisons are unchanged. Settings → reset clears one browser's local records and is not a launch reset.

**State: announcement timestamp pending; not run in production.** The query below has never been run against `default.events`. It runs once the public announcement exists and has a receipt.

## What it counts

`launchQuery` (`packages/statistics/launch.ts`) generates one fixed read-only SELECT over the existing `default.events` table ([telemetry](telemetry.md)) for the [SQL workbench](admin-sql.md). It decides eligibility once (the `classified` CTE) and every figure reads the same `included` attempts.

An attempt (a browser's `attempt_id` on one challenge revision) is **included** only when all of these hold:
- it has exactly one `practice.started` record with its origin (`data.from`) recorded;
- that start's `occurred_at` (device clock) **and** its `received_at` (ingest Worker clock) are both at or after the announcement. A start that reached us before the announcement began before it, whatever the device clock says;
- every one of its records has an `occurred_at` in the canonical form `YYYY-MM-DDTHH:MM:SS.sssZ`. Ingest accepts anything `Date.parse` reads (offsets, other formats), but the cutoffs compare text, so `2026-11-02T16:00:00.000+02:00` (14:00Z) would sort after a 14:30Z announcement. A non-canonical time is never trusted;
- every record counted is a person's (`actor = person`) with an accepted Terms version, in a supported practice capture (1.0–1.2), on a well-formed challenge and revision. These are the same rules as [admin statistics](admin-statistics.md) and [human cohorts](human-cohorts.md);
- its revision is not explicitly tagged `synthetic-qa` in the immutable `published_versions` metadata, the existing exclusion `syntheticRevisions` reads.

**Not counted, and reported** (attempts with any activity after the announcement):

| Column | Meaning |
| --- | --- |
| `prelaunch_resumed` | started before the announcement, then continued or completed after it. Not a launch attempt, however much happened later |
| `missing_start` | no start record readable: never uploaded, lost, ineligible, or older than the lookback. Never inferred from the first surviving event |
| `untrusted_start` | a start without its origin, or more than one start record |
| `malformed_time` | some record's `occurred_at` is not canonical UTC, so its place against the cutoffs is unknown |

**Conflicts make the whole report unavailable.** A conflict is a record whose copies, received before the as-of, differ (same `record_id`, different payload). Its copies can disagree on the type, the attempt, the browser or the challenge itself, so no attribution of it can be trusted, and an attempt that looks clean may be the one it belongs to. If **any** record read has a conflict, whatever its type, eligibility or revision and including the lookback, the `launch` row says `launch_status = unavailable` and every launch figure is NULL. Its `conflicting_records` counts every conflicting record read, and the `coverage` row stays reported. There is no partial total. Otherwise `launch_status = ready`.

**Figures for the included cohort** (the `launch` row): `attempts`, `browser_ids` (browsers, not people; not additive across rows), `completed` (browser-reported completion, not server grading), `submitted_attempts`, `submissions` (distinct Submit run IDs), `runs` (distinct run IDs seen queued) and `clock_ahead_starts` (included starts whose device time is later than their receipt: a clock running fast).

**The `coverage` row** covers records from the announcement to the as-of: `observed_records`, `duplicate_copies` (retried deliveries, counted once), `conflicting_records`, `arrived_after_as_of`, `synthetic_records`, `ineligible_records` (practice records failing the person, Terms or capture rule) and `latest_receipt` (the newest `received_at` read).

Output is exactly two rows of totals, `coverage` and `launch`: no participant, attempt, record, code or payload, and no breakdown. A per-origin breakdown would echo `data.from`, which ingest does not validate; a per-challenge breakdown can rest on one browser. Neither is needed for launch totals.

## Parameters

| Parameter | Rule |
| --- | --- |
| `--announced-at` | **Required, no default.** The exact UTC instant of the approved public announcement, from its receipt (the post's own timestamp), as `YYYY-MM-DDTHH:MM:SS.sssZ`. Never now, midnight, a guessed date, a commit, a deploy or an artifact's time. A date, an offset or a time without milliseconds is refused |
| `--receipt` | **Required.** The https URL of that announcement, written into the query's header so every result says where its boundary came from |
| `--as-of` | **Required.** The instant the report is "as of": only records that happened and were received before it count. Must be after the announcement, at most 31 days later and at least an hour in the past |
| `--registry` | **Required.** The `published_versions` rows (below). An empty or missing file is refused rather than counting synthetic QA as players |
| `--lookback-days` | Optional, 1–31, default 7. How far before the announcement start records are read. It only decides whether an excluded attempt is labelled `prelaunch_resumed` or `missing_start`; it never adds an attempt to the cohort |

## Procedure

1. **Wait for the receipt.** The public announcement must be approved and posted, and its URL and timestamp recorded on ENG-337. Without them, stop.
2. **Export the registry** (catalog metadata, not player data) with existing catalog read access into the gitignored `.local/`:
   ```sh
   npx wrangler d1 execute muscle-memory-catalog --remote --json --config apps/web/wrangler.jsonc \
     --command "SELECT challenge_key, revision, metadata_json FROM published_versions LIMIT 10001" \
     > .local/published-versions.json
   ```
3. **Generate the query** offline. It runs nothing and sends nothing:
   ```sh
   npm run launch:query -- --announced-at <receipt time> --receipt <announcement URL> \
     --as-of <instant> --registry .local/published-versions.json > .local/launch-report.sql
   ```
   Do not edit the output by hand. Change the parameters and generate it again.
4. **Check cost first.** Paste it into `/admin/sql` and run `EXPLAIN` on it (prefix the statement with `EXPLAIN`): this plans the query without reading rows.
5. **Run it once** (Run, or Ctrl/⌘-Enter) after the owner approves running it. Note the bytes scanned (when shown) and the `latest_receipt`. Keep the results in the admin (below).
6. **Record** on ENG-337: the generated header (announcement, receipt, as-of, lookback, exclusion count), the run time, the bytes scanned and the figures used. Do not record raw rows.

## As-of and late arrivals

Records arrive late. Devices queue them offline, a closed tab can hold them until the next visit, and Pipelines writes a file every 5 minutes. The report is therefore never "live" or instantly complete:
- **Stable as-of.** A record counts only if it was received before the as-of and happened before it. Every field the cohort depends on (type, IDs, challenge, times, payload, copies and conflicts) is read only from copies received before the as-of, so a copy arriving later, even a conflicting one, cannot change an earlier report. Re-running the same query later gives the same cohort and figures. The two exceptions are erasure, which removes deleted participants' rows from the current snapshot (figures can then only fall), and `arrived_after_as_of`, which grows as late records land.
- **Late records** are never added to an earlier as-of. They appear in `arrived_after_as_of`, and a later as-of counts them. An attempt whose start arrives late is excluded at that as-of, even if it happened before it.
- **Reporting policy.** Report fixed as-of instants: suggested announcement + 24 hours, + 7 days and + 30 days, each run no sooner than a day after its as-of, so most offline outboxes have drained. Always quote the as-of with a figure. If `arrived_after_as_of` is large compared with `observed_records` when the query runs, wait and run it again.

## Coverage limits

- **What "genuinely started" means here.** The only start evidence is the uploaded `practice.started` record. Its `occurred_at` is the device's clock, which the user controls; `received_at` is our server's clock but only says when the record arrived, not when the attempt began. The rule (both at or after the announcement) is the strongest check these records allow. It is evidence, not certainty about the real-world start time:
  - it does catch a fast clock whose start reached us before the announcement;
  - it cannot catch a start that genuinely began before the announcement, on a fast or altered clock, whose upload was also delayed past it (offline, or a tab reopened later);
  - a slow clock can push a genuinely post-launch start before the boundary, which excludes it (an undercount, never an addition);
  - `clock_ahead_starts` counts included starts whose device time is later than their receipt, an indicator of fast clocks, not a correction.
- **Only what was uploaded.** Visits before the Terms are accepted, abandoned outboxes and deleted participants are absent. Zero rows means no recorded supported activity, not zero plays.
- **Provenance.** Apart from exact `synthetic-qa` revisions, there is no field telling the owner's or testers' own play from anyone else's (see [admin statistics](admin-statistics.md)). Testing after the announcement on a regular challenge counts.
- **Browsers, not people.** One person on two browsers is two `browser_ids`; clearing storage makes a new one.
- **Non-canonical times outside the window.** The scan's `occurred_at` window compares text too. A non-canonical value that sorts outside it (an RFC 2822 date, an expanded year) is not read at all: if it was a start, the attempt has no start and is excluded; if not, that one record is missing from an included attempt's figures. Neither can add an attempt.
- **Small totals.** Shortly after launch the totals themselves can rest on very few browsers. They are for internal reading only.

## Privacy and sharing

The query reads the current Iceberg snapshot after erasure, with the existing read-only `ADMIN_STATS_SQL_TOKEN`, through the existing admin workbench. It adds no credential, binding, table, schedule or stored result. Internal statistics include stealth browsers, as the Privacy Notice says ([legal](legal.md)). Publishing any of these figures is a separate decision. It needs the publication boundaries in [legal](legal.md) first: stealth honoured and small groups suppressed. This query applies neither, so no figure from it is published as is. Keep results inside the admin, as for any workbench result.

## Cost and bounds

None of the bounds below caps bytes scanned or billing. What a run costs is **unknown until it runs** (or until authorized native planning evidence exists); nothing here has been checked against R2 SQL's own planner.

- **What is read.** Every `default.events` row whose `occurred_at` text falls between the announcement minus the lookback and the as-of (up to 62 days), including `payload`, which carries keys and code and is the bulk of the bytes. The 62 days bound which rows qualify, not how many bytes are read to find them.
- **Pruning is assumed, not proved.** Skipping Parquet files outside the window relies on R2 SQL pruning on `occurred_at` statistics. Pipelines writes files in arrival order, so it should mostly work, but late uploads put old times in new files and R2 SQL's planner was not inspected. Without pruning, a run reads the whole table.
- **Repeated reads, from the local plan only.** Local DataFusion 50.1.0 reads the table **twice** (once per output row, because CTEs are inlined). R2 SQL may plan differently. As an **estimate under both assumptions**, bytes scanned ≈ 2 × the bytes of the window's files, with Basin's minimum of 10 MB a query. At $0.0025/GB after 10 GB a month, a window whose files hold 1 GB would use roughly 2 GB of allowance. That is an estimate, not a bound.
- **Not cost limits.** The workbench's 30 s wait (R2 SQL keeps running and billing after it), its 5,000-row and 8 MiB answer limits, and the query's `LIMIT 2` limit only what comes back. *Stop waiting* stops only the wait; R2 SQL cannot cancel a running query.
- **How to learn the real figure.** `EXPLAIN` in the workbench (step 4) shows R2 SQL's own plan without reading rows; the bytes scanned are known only after the run, when R2 SQL reports them. Do both only once running it is approved.
- It is never scheduled, polled or run automatically.

## Validation

- `packages/statistics/launch.test.ts` runs the generated SELECT in SQLite on synthetic attempts. It covers: exact-boundary and later starts; prelaunch attempts resumed after the boundary, uploaded late, or with a fast clock; missing, too-old, origin-less, doubled and conflicting starts; fuzz-style source-contract edges (conflicting copies on the start, a Submit or the completion, whether they change the payload, make the copy ineligible, or change its attempt, type, browser, challenge, revision or time, each making the totals unavailable with every figure NULL; conflicts in a synthetic QA or prelaunch record doing the same; arbitrary origin text never echoed; eight non-canonical `occurred_at` forms on each of those records; and eleven rewrites in copies received after the as-of, none of which may change any figure); synthetic QA, no-Terms, model and unsupported records; duplicate deliveries; late arrivals and a stable as-of, including a later conflicting copy that tries to move a prelaunch start after the announcement; empty data; and two-row, aggregates-only output (no challenge, revision or origin text). It also checks parameter validation (missing, date-only, offset and impossible instants; as-of order, span and settle time; receipt URL; lookback; injection-shaped exclusions) and that the workbench's read-only check accepts the query.
- `tools/launch-query-check.ts` runs the same query in DataFusion 50.1.0 (CI installs it) and compares it with SQLite over thirteen scenarios, including a conflicting copy received after the as-of; conflicting copies that are ineligible or name another attempt or type, each leaving the totals unavailable; an arbitrary origin and non-canonical times.
- Neither is a live Basin run. Basin's native JSON functions are stood in by Python, as for the [cohort check](human-cohorts.md). The first production run is the live check, and it waits for the announcement and the owner's approval.
