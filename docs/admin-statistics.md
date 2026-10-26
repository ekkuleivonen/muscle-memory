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
- The coverage timestamps/counts describe all observation types in the date window, independently of challenge filters. Only practice capture 1.0 and 1.1 contribute table rows. Absence of rows establishes no recorded supported activity, not zero actual plays.

No reliable human/operator/synthetic/model provenance field exists in these streams. Exact challenge revisions explicitly tagged `synthetic-qa` in the existing immutable `published_versions` metadata are excluded and counted separately; titles, IDs, speed and code are not used as heuristics. Other activity prominently remains mixed/unknown provenance. If the metadata cannot be loaded, the query fails unavailable rather than silently including known QA. This uses the existing CATALOG_DB binding, not a new provenance schema. The view does not report unique people, exposure/play rate, first-ever/repeat players, abandonment, active time or time-to-solve. Uploaded data can be delayed, incomplete or absent. Queries see the current Iceberg snapshot after the existing erasure process; they never scan every physical Parquet file, which would resurrect superseded/deleted records.

## Access proposal — not applied

The app currently has no research-archive credential. The development Wrangler OAuth identity could read catalog/object metadata but its metadata-only SQL access test returned 401/40013. No alternative credential was tried and no catalog/SQL credential was retrieved, minted or installed.

Proposed separate approval:

1. Create a dedicated account API token named `muscle-memory-admin-statistics-read`, limited to the existing `muscle-memory-events` bucket in this account, with **Workers R2 SQL Read**, **Workers R2 Data Catalog Read** and **Workers R2 Storage Read**. No write permissions, other buckets, all-account resource wildcard, token-management permissions or provider credentials. Confirm the provider accepts this bucket-restricted read policy; if it requires broader resources, stop and report rather than expand it.
2. Install the token only as the existing web Worker's encrypted `ADMIN_STATS_SQL_TOKEN` secret. No `NEXT_PUBLIC_*`, repository secret value, local saved credential, browser token, new bucket/database/binding or service is needed. The target hostname, bucket and table are fixed in the server transport.
3. With approval, validate the exact fixed query against the live current snapshot, compare aggregate coverage, complete CI/review, then separately authorized merge/deploy and authenticated production checks. Local SQL tests are not proof of live Basin compatibility.

Current official guidance supports read-only catalog/SQL clients: [read-only token announcement](https://developers.cloudflare.com/changelog/post/2026-07-09-r2-data-catalog-read-only-tokens/), [R2 token permission groups and resource scoping](https://developers.cloudflare.com/r2/api/tokens/). The SQL query guide still contains an older read-write example; do not use that example to broaden this token. Existing CI catalog/pipeline credentials are not retrieved or repurposed.

[Basin SQL pricing](https://developers.cloudflare.com/basin-sql/platform/pricing/), checked 26 October 2026: 10 GB/month included, then $0.0025/GB scanned, minimum 10 MB per query, plus applicable R2/catalog read operations. 1,000 minimum-sized queries would consume about 10 GB; 100 queries beyond allowance would be roughly $0.0025 in SQL scan charges if each stayed at the minimum. Larger scans cost more; remaining account allowance is unknown. No subscription change is proposed. The view does not poll, prefetch results or retry, and applies a 15-second request deadline and bounded results. Timeouts are not a billing cap. Remove the secret to disable access immediately; no records or infrastructure need deletion.

## Verification

`packages/statistics/statistics.test.ts` executes the actual fixed SELECT against synthetic SQLite fixtures (namespace adapted; documented JSON/regexp functions provided). It tests expected aggregates, duplicates, identity/version joins, missing starts, window boundaries, conflicts, unsupported versions, empty data, invalid filters, result projection and transport bounds. This proves local interpretation logic, not live credentials or Cloudflare SQL execution. Built-worker/browser security and UI checks are separate fixtures. Synthetic tests do not upload research events or constitute human study data.
