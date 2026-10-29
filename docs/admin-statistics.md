# Basic admin statistics (ENG-355)

This is an existing-data interpretation, not an event or benchmark design. ENG-342's event/provenance/model decisions remain open. No new observations, player instrumentation, model runs, scheduled jobs or aggregate storage are introduced.

## What the view means

`/admin/statistics` uses the existing sole-operator authorization boundary. It makes one fixed SELECT only after **Load statistics**, with 1–31 inclusive UTC days and optional exact challenge/revision filters. Sorting is local. The response contains aggregates only, never participant IDs, attempt IDs, source code, profiles or raw events. No public query endpoint is added. Pages retain the admin no-store/noindex protection.

- Starts are distinct `(participant_id, attempt_id, challenge, challenge_revision)` with a recorded start inside the window. Opens are not starts.
- Browser IDs are distinct IDs among those starts, not unique people and not additive across revisions.
- Solves are browser-reported completion observations matched to a start in the same window and revision, at or after it. They are not independent server grading.
- Completion rate is matched completed attempts / started attempts, with both counts shown. It is not eventual success or abandonment. Starts before the window and completions after it are not paired.
- Submissions count distinct Submit run IDs; runs requested count distinct run IDs observed queued, including examples. Queued does not establish execution or success. Missing run IDs contribute neither count.
- Attempts with observed practice activity but no start in the window are separately shown. Unsupported captures and conflicting record IDs are excluded and counted in coverage. Identical retries deduplicate by record ID.
- The coverage timestamps/counts describe all observation types in the date window, independently of challenge filters. Only practice capture 1.0, 1.1 and 1.2 contribute table rows. Absence of rows establishes no recorded supported activity, not zero actual plays.

No reliable human/operator/synthetic/model provenance field exists in these streams. Exact challenge revisions explicitly tagged `synthetic-qa` in the existing immutable `published_versions` metadata are excluded and counted separately; titles, IDs, speed and code are not used as heuristics. Other activity prominently remains mixed/unknown provenance. If the metadata cannot be loaded, the query fails unavailable rather than silently including known QA. This uses the existing CATALOG_DB binding, not a new provenance schema. The view does not report unique people, exposure/play rate, first-ever/repeat players, abandonment, active time or time-to-solve. Uploaded data can be delayed, incomplete or absent. Queries see the current Iceberg snapshot after the existing erasure process; they never scan every physical Parquet file, which would resurrect superseded/deleted records.

## Production access

On 26 October 2026 the owner explicitly approved account-wide read-only access after the dashboard could not express bucket-only catalog/SQL permissions. The dedicated `muscle-memory-admin-statistics-read` account token has exactly **Basin SQL Read**, **Basin Catalog Read** and **Workers R2 Storage Read** (Basin is Cloudflare's current name for the R2 SQL/catalog products). No write, delete or token-management permission is granted. Its persisted policy was checked after creation.

This token can read other R2 buckets/catalogs in the account too: exposure would put that wider data at risk. This view targets only `muscle-memory-events/default.events`, with a fixed query and validated date/challenge/revision filters. The [SQL workbench](admin-sql.md) reuses the token for the operator's own read-only SQL, still only against the `muscle-memory-events` bucket's `default` namespace and behind the same admin checks. Do not treat those application restrictions as a narrower token capability or inspect unrelated bucket contents.

The token is installed only as the web Worker's encrypted `ADMIN_STATS_SQL_TOKEN` secret, never a `NEXT_PUBLIC_*` value, source file, repository-secret value or browser credential. No new bucket, database, service or machine dependency is needed. Existing CI catalog/pipeline credentials were not retrieved or repurposed; no extra token-management credential was created.

The fixed query was successfully executed against the current Iceberg snapshot using this token on 26 October 2026. That dated verification sample covers a selected UTC window, not a universal/current usage count. Live query verification is separate from synthetic SQLite and browser fixtures.

[Cloudflare's read-only token guidance](https://developers.cloudflare.com/changelog/post/2026-07-09-r2-data-catalog-read-only-tokens/) and [R2 permission groups](https://developers.cloudflare.com/r2/api/tokens/) describe the read capabilities. The broader account scope required and received separate owner approval; do not silently expand this token's permissions or resources later.

[Basin SQL pricing](https://developers.cloudflare.com/basin-sql/platform/pricing/), checked 26 October 2026: 10 GB/month included, then $0.0025/GB scanned, minimum 10 MB per query, plus applicable R2/catalog read operations. 1,000 minimum-sized queries would consume about 10 GB; 100 queries beyond allowance would be roughly $0.0025 in SQL scan charges if each stayed at the minimum. Larger scans cost more; remaining account allowance is unknown. No subscription change is proposed. The view does not poll, prefetch results or retry, and applies a 15-second request deadline and bounded results. Timeouts are not a billing cap. Remove the secret to disable access immediately; no records or infrastructure need deletion.

## Verification

`packages/statistics/statistics.test.ts` executes the actual fixed SELECT against synthetic SQLite fixtures (namespace adapted; documented JSON/regexp functions provided). It tests expected aggregates, duplicates, identity/version joins, missing starts, window boundaries, conflicts, unsupported versions, empty data, invalid filters, result projection and transport bounds. This proves local interpretation logic, not live credentials or Cloudflare SQL execution. Built-worker/browser security and UI checks are separate fixtures. Synthetic tests do not upload research events or constitute human study data.

### Planner regression (29 October 2026)

The former challenge branch of the aggregate UNION projected eight unnamed `NULL`
columns. DataFusion 50.1.0 rejects that projection before reading rows: projection
expression names must be unique. SQLite accepts it, which let the original fixtures
pass. Each placeholder now has its existing output-column name; counting, filters,
ownership/access, exclusions and result projection are unchanged.

Run `STATS_SQL_PYTHON=python node --import tsx --test packages/statistics/statistics.test.ts`
in an environment with DataFusion 50.1.0 installed. This optional physical check was
verified locally; this repair does not add a CI workflow step. The suite proves the former query fails and physically executes
the repaired query against the same synthetic empty, populated, duplicate, conflict,
revision, date-boundary and missing-start fixtures as SQLite. Python JSON stand-ins
are used; this is a planner/semantics regression, not fresh native Basin or production
acceptance. No real records, credentials or raw event output are used by these tests.
