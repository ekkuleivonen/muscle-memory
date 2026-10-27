# SQL workbench (ENG-373)

`/admin/sql` lets the operator write read-only SQL against the gameplay and model tables and explore what comes back, without other tools. It is behind the same Access application and server-side identity check as the rest of `/admin` ([admin foundation](admin-foundation.md)).

## What it reads, and with what

- **R2 SQL over the events bucket only.** The server posts to the Basin SQL endpoint for `muscle-memory-events` (`packages/workbench/read.ts`); the bucket is in the URL, so no other bucket or warehouse can be named from SQL. Its tables are in the `default` namespace: `events` (people's practice and site records, [telemetry](telemetry.md)), `model_events` and `model_catalog` ([model runs](model-runs.md)).
- **The statistics credential.** It reuses `ADMIN_STATS_SQL_TOKEN`, the read-only account token described in [admin statistics](admin-statistics.md) (Basin SQL Read, Basin Catalog Read, R2 Storage Read). No new credential, permission or binding. The token stays in the Worker; it is never in a response, the page or a log.
- **No other data source.** D1, the content bucket and the catalog's REST API are not reachable from here.

## The read-only check

R2 SQL only runs reads, and the token can only read; the server checks each query anyway, before anything is sent (`checkQuery` in `packages/workbench/sql.ts`):

- The text is tokenized (strings, quoted names, `--` and `/* */` comments). Unclosed strings or comments, nested block comments, and strings whose end depends on whether `\` escapes are refused, so the check and the engine cannot disagree about where a statement ends.
- Exactly one statement (a trailing `;` is fine). It must start with `SELECT`, `WITH`, `VALUES`, `SHOW`, `DESCRIBE` or `EXPLAIN`.
- No write, DDL, transaction or session word anywhere outside strings and quoted names (`INSERT`, `UPDATE`, `DELETE`, `MERGE`, `CREATE`, `DROP`, `ALTER`, `COPY`, `SET`, `INTO`, …). A column with such a name can be written quoted (`"update"`).
- Tables after `FROM`, `JOIN` and in comma lists (in every subquery and CTE) must be bare names or `default.<table>`; three-part names, other namespaces and table functions (`read_parquet(…)`) are refused. `SHOW` is limited to `SHOW DATABASES`/`NAMESPACES` and `SHOW TABLES IN default`; `DESCRIBE` to `default.<table>`.

A refusal says why and, where it can, marks the place in the editor. The tests in `packages/workbench/workbench.test.ts` cover CTEs, comments, several statements, writes hidden in CTEs and `EXPLAIN`, backslash string tricks and other namespaces.

## Bounds and cost

- **Explicit runs only.** A query runs when the operator presses Run or Ctrl/⌘-Enter. Nothing runs while typing, on load, or on a timer. Opening the page reads the schema once if this browser has no copy (`SHOW TABLES` and one `DESCRIBE` per table: metadata, no rows); after that only **Refresh** reads it again.
- **Per query:** at most 20,000 characters of SQL; the server waits 30 s; keeps the first 5,000 rows; drops answers over 8 MiB. `SQL_WORKBENCH_TIMEOUT_MS`, `SQL_WORKBENCH_MAX_ROWS` and `SQL_WORKBENCH_MAX_BYTES` (Worker vars, clamped to 1–120 s, 1–50,000 rows, 64 KiB–32 MiB) change them. At most two queries run at once per Worker isolate (best effort: isolates do not share the count); the page itself runs one at a time and queues one more.
- **LIMIT is not a cost limit.** R2 SQL bills bytes scanned ($0.0025/GB after 10 GB a month, at least 10 MB a query, see [admin statistics](admin-statistics.md)); a LIMIT caps the rows returned, not the scan. The page says so. Without a LIMIT, R2 SQL returns at most 500 rows; when that many come back the page says there may be more.
- **Stopping.** *Stop waiting* aborts the browser's request and the server's wait. R2 SQL has no cancel: the query may still run to the end and be billed. The page says exactly that, and ignores any late answer.
- **Scan figures** (bytes and files scanned) are shown only when R2 SQL's response carries them as numbers; there is no estimate before running.

## The page

- **Editor:** CodeMirror with R2 SQL highlighting, line numbers, indentation, bracket matching and closing, search (Ctrl/⌘-F) and error marks. Ctrl/⌘-Enter runs the selection, or else the statement at the cursor (statements split on `;` outside strings and comments, as the server does); the status line says which lines ran. **Format** (Shift-Alt-F) re-spaces tokens and upper-cases reserved words only, leaving strings, quoted names, numbers and comments exactly as written.
- **Completion:** tables and columns from the live schema (with `alias.` after `FROM default.events e`), names defined with `WITH name AS (…)`, keywords from the R2 SQL reference and only the functions its documentation lists (`packages/workbench/dialect.ts`, checked 27 October 2026). Columns of a CTE are not completed.
- **Schema panel:** tables and columns with their types and nullability, searchable; click a name to insert it. Hints on a few columns (JSON `payload`, timestamps as text, `record_id` duplicates, `participant_id`) come from the code that writes them (`apps/web/app/admin/sql/examples.ts`).
- **Examples** open in a new tab and never run on their own: latest practice events, events by type, attempts/runs/completions per challenge, starts and completions by day, model runs by model and outcome. They select counts, types and times, never code or participant IDs.
- **Results:** a virtualized grid with sticky headers, resizable columns (double-click a handle to fit), the reported types, NULL distinct from empty text and zero, numbers right-aligned and grouped, JSON shown as a summary and opened as a tree in the inspector (Enter or double-click). Rows returned, total time and time in R2 SQL, scan figures, truncation and the 500-row default are stated. Sorting and filtering work on the returned rows and say so.
- **Copy and export:** cell (Ctrl/⌘-C), row (Shift too, or JSON from the inspector), the shown rows as TSV, CSV or JSON. Exports contain exactly the rows shown (after the local filter and sort), never more than were returned. CSV is RFC 4180 with a UTF-8 BOM; text starting with `=`, `+`, `-`, `@`, tab or CR gets a leading `'` so spreadsheets do not run it. NULL is an empty CSV field and `null` in JSON.
- **Kept in this browser:** query tabs (up to 12) and the history of the last 60 queries run, in localStorage under `mm-admin-sql-v1`: SQL text, time, status and row count, never rows. The schema copy is under `mm-admin-sql-schema-v1`. Results live only in the page's memory. A late or superseded answer never replaces a newer one.

Query results can hold private participant data (`payload` holds code; `participant_id` is a browser's ID). Keep them inside the admin: do not paste them into issues, screenshots or CI artifacts. Admin pages are never recorded as site telemetry. The server never logs queries, results or upstream bodies. Inspection is not permission to publish raw records, and erasure still applies: R2 SQL reads the current Iceberg snapshot, after the erasure job's deletes.

## Checking

`npm test` runs the check, splitting, formatting, export and transport tests. `ADMIN_STATS_FIXTURE=1 node tools/browser/admin-check.mjs` (after `npm run build:cloudflare`) also drives the workbench in Chromium against a synthetic R2 SQL: Access denial on the page and both endpoints (anonymous, wrong identity, expired, forged, cross-origin), refused writes that never reach R2 SQL, schema and completion, statement runs, errors marked in the editor, stop and late answers, queueing, sorting, filtering, the inspector, CSV, the 500-row note, formatting, drafts across a reload, and the mobile layout. Without the fixture it checks the page says the credential is missing.
