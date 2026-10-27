# ENG-340: owner history failure, 28 October 2026 (open)

The owner still sees "Your earlier practice couldn't be added right now" on main `6683787`, and a fresh reload doesn't help (16:30 UTC). A stale pre-deploy tab is ruled out. Everything below is source analysis and local synthetic execution; nothing here is owner acceptance, and **the server cause is not diagnosed**. The admission-budget explanation below is a hypothesis only.

## Runtime evidence available to this agent: none

Checked on 28 October without creating access or changing anything:

| Route | Result |
| --- | --- |
| Wrangler on this machine | An OAuth session exists, but its scopes are only `user (read)` and `offline_access`, and it lists no account. No Workers tail or logs, so `wrangler tail` wasn't attempted. No `CLOUDFLARE_API_TOKEN` or account ID in the environment |
| Workers observability or Basin workbench | No credential available. CI secrets weren't read |
| The owner's browser | Not reachable: T3 device access is off for this environment, and preview tabs reach only this machine's local server |
| Production `/api/private-history` | Not called: a request needs the owner's device secret, and the route logs nothing by design |

So the server repair stays unimplemented until a native result or the owner's fixed reason code exists.

## What the query costs

`historyQuery` (`packages/developer-profile/uploaded-history.ts`) as planned by DataFusion 50.1.0:

- **Three full table scans.** The `owner` CTE is inlined, not materialized: the conflict check, the attempt aggregate and the final payload join each read `default.events` again.
- **Payload read every time.** Each scan reads the `payload` column. Filter pushdown into Parquet decode is off by default, so the payload pages of every row are decoded, not just the owner's.
- **Little or no pruning.** The table is unpartitioned, with a Parquet file every 5 minutes. Participant IDs are random, so file min/max statistics can barely prune.
- **Consequence.** Query work grows with the whole table, roughly three times over, not with the page limits. The 25,000-record and 10,000-record bounds limit output, not work.
- **Gated constructs.** On top of the scans: `COUNT(DISTINCT payload)` in the conflict check, and `ROW_NUMBER`, two running `SUM … OVER` and a `LAG` in the page bounding.

Local DataFusion timings on synthetic data (unrealistically compressible payloads):

| Synthetic table | Time |
| --- | --- |
| ~225k rows | 275 ms |
| ~825k rows | 720 ms |

The owner was the same in both, so cost grows with table size. Local DataFusion does not apply Basin's admission budget, so it cannot reproduce a 400.

## Why that points at Basin's admission budget

Basin SQL's documentation:
- **Estimate and reject:** it estimates the memory a query needs before running it, and rejects it with a **400** if too much data would be scanned.
- **Budget-gated:** window functions and any aggregate with `DISTINCT` are budget-gated up front.

The earlier owner request failed with `storage-http-400` after about 7.8 s. A gate that depends on the scanned data volume would also explain two other observations:
- **Fresh, not stale:** the failure persists across reloads.
- **Other participants pass:** a synthetic owner can still succeed if its ID prunes more files or its estimate is smaller.

This is a hypothesis until Basin itself is asked.

## Decisive check without the owner's browser

`node --import tsx tools/history-query-probes.ts` prints five read-only probes built from the shipped query. Each returns counts or sizes, never payloads:

1. Owner volume with no gated operations.
2. The conflict check as shipped (`COUNT(DISTINCT payload)`).
3. The same check as `MIN(payload) <> MAX(payload)`, which is equivalent for non-null payloads.
4. The window functions alone over per-attempt aggregates.
5. The full shipped query wrapped in `COUNT(*)`.

All five run in DataFusion 50.1.0 on synthetic data. Someone with authorized SQL workbench access fills in the owner's participant ID there and records which probes fail, with the exact status and error. The ID never needs to leave the workbench.

Evidence limits:
- **Probe 4:** consumes every window it computes (`ROW_NUMBER`, both running `SUM`s and `LAG`), so an optimizer can't prune one away. Its input is per-attempt aggregates, not the shipped `costs` rows.
- **Probe 5:** aggregates the full query's output, including total payload bytes, so payload must still be read. In DataFusion its plan keeps the same three table scans with payload projection as the bare query. Result transfer still differs, and Basin may plan differently, so a passing probe 5 does not clear the real request.
- **Probes 1–4:** each runs a fragment of the query, so they show which fragment fails, not that it's the only cause.

How to read the results, if one fails as the budget hypothesis predicts:
- **1 fails:** the plain scan is already over budget, and the query needs a narrower scan (a time-window filter on `occurred_at` before aggregation, or compaction).
- **2 fails but 3 passes:** replacing `COUNT(DISTINCT payload)` with `MIN <> MAX` is an exact, semantics-preserving fix.
- **4 fails:** page bounding must leave SQL. Either the Worker computes the frontier from a payload-free first query and then reads the chosen attempts, which means two queries per page, or the bounding is rewritten without window functions.
- **Only 5 fails:** the combination exceeds the budget, and probes 1–4 size each part.

None of these changes ownership: every probe and fix stays scoped to one verified participant.

## Client side (this PR)

Whatever the cause, the report now records a fixed reason code on its status line and in one console line, and retries transient failures at the server's pace. See the "History recovery" note in [developer-profile](developer-profile.md). After it ships, the owner's next load shows `http-503:storage-http-400`, `timeout` or another fixed code, without a HAR.
