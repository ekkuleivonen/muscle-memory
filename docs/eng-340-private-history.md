# ENG-340: approved option A implementation and binding approval

Ekku approved **option A's direction** on 27 October 2026 via dot: reuse existing uploads, owner-only code-free summaries, no new collection or persistent storage, unchanged retention, explicit loading, reset/deletion/stealth safeguards and revised disclosure. Local historical retention remains disabled. This is **not** approval to install a binding, merge or deploy.

## Exact remaining security-boundary approval

| Item | Proposed configuration / capability |
| --- | --- |
| Caller | Existing web Worker `muscle-memory` |
| New binding | `PARTICIPANT_OWNER` service binding |
| Target | Existing `muscle-memory-ingest`, named entrypoint `ParticipantOwner` |
| Application method | `verify(participant: string, secret: string)` → `owned`, `absent`, `deleted`, `denied` |
| Data read | Only exact `CONTROL/participants/<validated-id>` ownership proof and `CONTROL/deleted/<validated-id>` tombstone; existing per-participant rate limiter |
| Data returned | One status; no proof, secret, identity list, raw rows, code, profile, SQL or arbitrary R2 path |
| Mutations | None; cannot claim an identity, upload, delete or write an access request |
| Checks | Validate ID/secret bounds; read fresh tombstone; compare SHA-256 of the original secret with fresh proof; recheck tombstone; no upload proof cache |
| SQL authority | Existing `muscle-memory-admin-statistics-read` token stays solely in web's encrypted `ADMIN_STATS_SQL_TOKEN`, with exactly Basin SQL Read, Basin Catalog Read and Workers R2 Storage Read |
| Scope caveat | That existing token is account-wide. Fixed application queries are **not** a narrower token capability. No token copy or scope change is proposed |

**Do not install yet.** The production config addition, after explicit approval, would be this entry in `apps/web/wrangler.jsonc`'s `services` array:

```json
{ "binding": "PARTICIPANT_OWNER", "service": "muscle-memory-ingest", "entrypoint": "ParticipantOwner" }
```

The entry is deliberately absent. Ingest's implementation entry module changes from `src/index.ts` to `src/worker.ts` to export the named RPC class alongside the unchanged public ingest handler. That is source preparation, not a deployment. A separately authorized deployment would update ingest first, then web with the approved binding. No new token, secret installation, bucket permission, CONTROL binding in web, service, database or job is needed. An absent service binding or SQL secret returns an explicit unavailable state and performs no SQL read. Disabling/removing the service binding disables the reader without deleting records. Credentials have not been retrieved or changed.

## Read path and limits

`POST /api/private-history` requires the current Terms cookie, exact same Origin and a ≤2 KiB JSON body containing the original device secret, participant and validated dates/cursor. An ID, referral code or upload hash is insufficient. Web verifies ownership through RPC before SQL and again after derivation. A deletion tombstone or removed proof blocks the result even when deletion occurred during the query. RPC failures and SQL failures return fixed messages without private exceptions/logs.

The query is a fixed SELECT against **current `default.events`**, scoped to the proven owner and practice observations only. It never accepts SQL, table names, raw projections or snapshot IDs from the browser. SQL/raw observation payloads cannot pass through the verification RPC. Raw payloads are processed only internally by web's shared deterministic interpreter and are never returned by the history endpoint. Artifacts, source code, raw keys, outputs and arbitrary error text are excluded from responses. Reflection answers are projected from the existing defined choices; timeline labels and runtime/editor conditions are bounded and filtered.

- Dates discover attempts with activity in 1–366 inclusive UTC days. All uploaded observations for each selected attempt are interpreted, including starts/resumes outside that window. The date window never cuts a selected attempt into a falsely complete fragment.
- Five attempt IDs per page, with a validated untrusted ID cursor and one lookahead entry. Multiple immutable revisions remain separate summaries. Empty means no selected uploaded evidence at query time, not no lifetime practice.
- Per attempt: 10,000 observation rows / 4 MiB UTF-8 input. Over budget yields an explicit unavailable entry with no guessed challenge/revision or values. Retries count toward the read budget but deduplicate by record ID for interpretation. Cross-attempt conflicting IDs invalidate affected metrics too.
- Per query: 15 seconds across fetch and body reads; 24 MiB upstream response bound. Per response: 256 KiB. Failed/truncated transport never becomes a partial complete trace. Large histories can be explored through additional dates/pages; large individual attempts still need a separately validated bounded streaming/checkpoint reader.
- No persistent or memory result cache. At most two concurrent SQL queries per web isolate, a bounded 1,024-owner recent-read map, and at most one new SQL query per owner per minute **within that isolate**. Existing ingest rate limits also apply to verification. This is neither globally exact rate limiting nor a hard billing cap; no new CF rate-limit binding is silently installed. Minimum SQL scan charges still apply; no polling/retries/prefetch.
- Dashboard memory: up to 100 attempt/revision summaries. Narrow the window or start another view to explore more. Each page uses its then-current snapshot, not a frozen export. Late arrivals behind a cursor can require reloading from the start. The UI discloses this; it never claims an atomic complete account history. An attempt/revision on a later page replaces any same-key summary rather than adding duplicate counts.

The pipeline may lag by minutes. Local evidence and uploaded history are deliberately **separate views**; summaries are not summed or merged with pending local records. Device progress counts and next-challenge suggestions remain labelled device-local. Completion keeps its immediate local verdict. Uploaded observations drive the same personal observations, detailed metric inventory, matched-repeat windows and supporting timelines after explicit load.

## Retention and lifecycle

| State | Behaviour |
| --- | --- |
| Server raw records | Existing account-lifetime retention; existing deletion within 30 days including older copies; no change |
| Derived summaries | Private request memory and mounted dashboard RAM only; no R2/D1/IndexedDB/localStorage/Cache API store; no HTTP/CDN caching |
| Browser history retention | `PROFILE_HISTORY_ENABLED` remains false; latest-attempt compaction unchanged; viewing stats does not create an identity or write summaries |
| Reset | Synchronously clear uploaded view and cancel/discard pending reads; server uploads remain as already disclosed; never automatically reload them |
| Delete | Clear view at operation start; refuse reads on tombstone immediately; fresh proof/tombstone recheck after query; existing erasure still owns physical deletion |
| Logout/import/privacy/storage boundary | Clear uploaded view, invalidate read generation, abort request; explicit new action required |
| Stealth | Own private history remains accessible after explicit action; human/model comparisons hidden; no public human aggregate is enabled. Future publication must exclude all historical data using current stealth |
| Backup | Uploaded response is never saved in backups; existing ownership secret in a private backup can authorize the same participant; no ID-only recovery |

The actual Privacy Notice is revised in this draft and `LEGAL_VERSION` is bumped to `2026-10-27.2`, following the existing process for renewed acceptance on eventual release. No live notice, consent or collection setting has changed. Disclosure and security review remain release gates, as does integrating ENG-371's final merged loader/hydration/CI changes. Human cohorts stay suppressed pending a separately approved minimum and eligible data, including separate safeguards for 16–17-year-olds.

## Verification evidence

Synthetic tests execute the actual fixed SQL in SQLite (table namespace adapted; no claim of live Basin execution). They cover owner isolation, whole-attempt window selection, pagination, record-ID duplicates/conflicts across attempts, gaps, mixed revisions, invalid filters, budget limits, code-free projection, absent/wrong/proof-only ownership, deletion during query, reset then failed reread, fetch/stream deadlines and response-size limits. Ingest verifier tests exercise fresh proof rotation, tombstone races, rate limits and no writes. Browser fixtures exercise the mounted explicit-load, stale/error and privacy/reset paths without uploading anything. Live RPC/Basin verification remains unavailable until the specific binding is approved and a separate deployment is authorized.
