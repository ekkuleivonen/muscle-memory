# ENG-340: approved option A implementation and binding approval

> **ENG-374 update:** the report now reads the first history page automatically on an ordinary visit instead of behind a load button, keeps the result in page memory for up to five minutes, and stealth reads nothing at all. The endpoint, query, budgets, ownership checks and retention below are unchanged. Where this page says "explicit" load or that history never reloads after reset, [the report](developer-profile.md#data-freshness-and-boundaries) supersedes it.

Ekku approved **option A's direction** on 27 October 2026 via dot: reuse existing uploads, owner-only code-free summaries, no new collection or persistent storage, unchanged retention, explicit loading, reset/deletion/stealth safeguards and revised disclosure. Local historical retention remains disabled. Ekku subsequently approved the exact verification binding and existing-token use through dot on 27 October. The binding is now prepared in source. Dashboard merge/deployment still require final review and a subsequent release instruction. Any live binding-only rollout must be coordinated with dot.

## Approved security boundary

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

**Approved configuration, prepared but not deployed here.** The entry is now present in `apps/web/wrangler.jsonc`'s `services` array:

```json
{ "binding": "PARTICIPANT_OWNER", "service": "muscle-memory-ingest", "entrypoint": "ParticipantOwner" }
```

The entry is committed for review; it has not been installed live from this branch. Ingest's implementation entry module changes from `src/index.ts` to `src/worker.ts` to export the named RPC class alongside the unchanged public ingest handler. That is source preparation, not a deployment. A coordinated binding-only rollout must update ingest first and preserve the currently approved web application; it must not deploy this unreviewed dashboard. Normal eventual dashboard release also updates ingest before web. No new token, secret installation, bucket permission, CONTROL binding in web, service, database or job is needed. An absent service binding or SQL secret returns an explicit unavailable state and performs no SQL read. Disabling/removing the service binding disables the reader without deleting records. Credentials have not been retrieved or changed.

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

The actual Privacy Notice is revised in this draft and `LEGAL_VERSION` is bumped to `2026-10-27.2`, following the existing process for renewed acceptance on eventual release. No live notice, consent or collection setting has changed. Disclosure and security review remain release gates. ENG-371 / PR65's actual merge `4676f4326655c4938f85aedaba6a55061ee496a4` is integrated, preserving its private loaders/hydration/CI changes. Human cohorts stay suppressed pending a separately approved minimum and eligible data, including separate safeguards for 16–17-year-olds.

## Verification evidence

The first live owner read exposed a DataFusion physical-planner incompatibility that SQLite did not catch: an `IN (SELECT ...)` expression inside an aggregate `CASE`. The fixed query left-joins the unique conflicting record IDs instead, preserving owner-row cardinality and conflict counts. `tools/history-query-check.ts` executes six synthetic scenarios in DataFusion 50.1.0 and compares them with SQLite (empty history, ordinary history, duplicates, cross-attempt conflicts/foreign owner, and both pagination pages). Install `datafusion==50.1.0`, then run `node --import tsx tools/history-query-check.ts`; `HISTORY_SQL_PYTHON` can select a temporary Python environment. This is a real physical-execution check, not a claim that Cloudflare pins that engine version. CI runs it without private material or credentials before the web/deploy job.

Synthetic tests execute the actual fixed SQL in SQLite (table namespace adapted; no claim of live Basin execution). They cover owner isolation, whole-attempt window selection, pagination, record-ID duplicates/conflicts across attempts, gaps, mixed revisions, invalid filters, budget limits, code-free projection, absent/wrong/proof-only ownership, deletion during query, reset then failed reread, fetch/stream deadlines and response-size limits. Ingest verifier tests exercise fresh proof rotation, tombstone races, rate limits and no writes. Browser fixtures exercise the mounted explicit-load, stale/error and privacy/reset paths without uploading anything. Live RPC/Basin verification remains a coordinated rollout check; the binding and existing-token use are approved, but this dashboard remains undeployed pending independent security/product review and subsequent release instruction.

## Native runtime contract check

`npm run test:owner-rpc` compiles the actual ingest entry module, validates the exact service binding in the production source configuration, and exercises the named entrypoint through local Workers RPC and a synthetic R2 bucket. It checks original-secret ownership, wrong-secret/upload-hash rejection, participant isolation, tombstone precedence even after proof removal, rejection of bucket/SQL methods and absence of a public ingest history route. It requires no private catalog, credentials or network/cloud reads and runs with the public catalog-contract CI job. This is native local runtime evidence, not a claim of live rollout verification.

## Binding-only rollout coordination

No live rollout is necessary to publish the review bundle. If dot chooses a binding-only rollout, prepare it from the currently approved main application using **only** ingest `owner.ts`, `worker.ts`, `rpc-runtime.d.ts`, the ingest `main` entry-module change and web's exact approved service-binding entry (plus their synthetic tests). Do not include the player history API, SQL reader, stats UI, Privacy Notice/version or any other dashboard implementation. Update ingest before web so the named entrypoint exists. Do not deploy this feature branch as a shortcut. The account token remains unchanged and uninspected in web; no secret copy is necessary. The independently reviewed dashboard can be released later only under subsequent explicit instruction.

## Explicit configuration / deployment receipt

| Checkpoint | Receipt | Meaning |
| --- | --- | --- |
| Root-reviewed head `2746eeb` | Source `apps/web/wrangler.jsonc` contained only `WORKER_SELF_REFERENCE` | The approved binding was not yet prepared there; the private reader remained fail-closed |
| Preparation commit `5b84423` and later PR67 heads | Source contains `PARTICIPANT_OWNER` → `muscle-memory-ingest` / `ParticipantOwner`; `test:owner-rpc` reads and validates that exact entry | Approved configuration is prepared in the PR, not proven installed in production |
| Live history configuration | **No production installation/version/RPC receipt supplied or claimed by this branch** | Treat uploaded history as unconfigured until dot confirms the ingest entrypoint and web service binding are deployed together under the approved rollout boundary |
| Missing live binding or SQL secret | Server returns 503 with a fixed unconfigured message and performs no SQL read | Approval/source presence does not make the live reader configured |

A future live receipt must identify the ingest deployment exporting `ParticipantOwner`, the web deployment containing its service binding, the approved base application/commit, and a safe verification result. PR65's production receipt confirms its catalog release only; it is not an ENG-340 binding/history receipt. No dashboard deployment approval is inferred. Any prior wording “binding configured” means **prepared in source only**, not a working live history reader.
