# ENG-340: independent security review handoff

Review the history implementation on draft PR67 against current main, including the owner-approved `PARTICIPANT_OWNER` binding. This is a request for independent review, not a record of approval. Do not merge, deploy, provision credentials, change access or run paid models during review. Use synthetic inputs only; never put player code, private challenge material, tokens, raw rows or private logs into findings/artifacts.

## Approval and integration baseline

Ekku approved option A and the exact binding/use of existing SQL authority via dot on 27 October 2026:

- Web `muscle-memory` → `PARTICIPANT_OWNER` → existing `muscle-memory-ingest`, named entrypoint `ParticipantOwner`.
- `verify(participant, secret)` returns ownership/deletion status only. Original secret required; an ID, upload proof or Terms cookie alone is insufficient.
- Existing account-wide read-only SQL token stays solely in web's `ADMIN_STATS_SQL_TOKEN`; no new credentials, copied secret, CONTROL grant in web or broader token permissions.
- Fixed owner-scoped queries of existing uploaded records; code-free request/page-memory summaries; no new collection, persistent derived store or additional local historical retention; existing raw retention/erasure unchanged.
- Preparation is approved. Dashboard merge/deployment is not. Coordinate any binding-only live rollout with dot without shipping this unreviewed dashboard.

PR65's actual merge `4676f4326655c4938f85aedaba6a55061ee496a4` is integrated. Dot verified its production run `40469560113`, web version `bea90685-3939-4719-892d-1bea2c35aaa2`, 69 published challenges/118 revisions and desktop/mobile solving. That validates the dependency's release, not this dashboard or live history RPC. The private managed loader and CI hydration are preserved; no removed material is restored.

## Review surface

| Boundary | Files | Adversarial questions |
| --- | --- | --- |
| Production capability | `apps/web/wrangler.jsonc`, `apps/ingest/wrangler.jsonc`, `apps/ingest/src/worker.ts` | Does only the approved verification binding get added? Can inherited RPC methods, the default HTTP entrypoint or errors disclose R2/SQL authority? Is the broad token confined to web? |
| Proof / erasure | `apps/ingest/src/owner.ts`, `packages/developer-profile/uploaded-history.ts` (`ownerHistory`) | Are ID/hash-only, wrong-secret, malformed-ID and absent-proof states fail-closed? Are proof/tombstones fresh before/after, including deletion during a failed SQL read? Can stale upload-proof cache affect read authorization? |
| Endpoint | `apps/web/app/api/private-history/route.ts`, `apps/web/lib/uploaded-history-server.ts` | POST/current Terms/same Origin/body size; no subject/secret in URL or logs; bounded configured authority; fixed errors; no-store; safe response on absent binding, RPC/SQL failures and throttles. |
| SQL / projection | `packages/developer-profile/uploaded-history.ts`, shared `derive.ts`/`registry.ts` | Can validated filters/cursor inject SQL or select another owner/snapshot? Are whole attempts, duplicate/conflicting IDs, source resumes, unsupported/gapped/truncated evidence and limits represented honestly? Can raw payloads/code/keys/output/free text escape through summaries? |
| Browser lifecycle | `apps/web/app/stats/uploaded-history.tsx`, `stats.tsx`, `packages/developer-profile/private-view.ts`, web `private-boundary.ts`/`account.ts`/`backup.ts` | Explicit loading only; no writes/automatic restoration; overlapping reads and reset/delete/logout/import/privacy/consent/storage boundaries; obsolete generations and failed rereads; synchronous clearing on auth rejection. |
| Comparisons | stats model components, model receipt route/reader | Stealth hides model/human comparisons while own history remains accessible. No human aggregate or cohort bypass; exact revisions/runtime/diagnostics and model identity/protocol; no stable-probability/race claim. |
| Disclosure | actual Privacy Notice, `legal.ts`, `docs/eng-340-private-history.md` | Versioned draft disclosure matches real retention, history bounds, reset/deletion/stealth and no recovery/sync promise. No live disclosure or collection change yet. |

The original root review found missing generation barriers/stale-sensitive-history retention and omission of pre-test user-code failure recovery. Both are addressed with regression tests; scrutinize the new uploaded path independently rather than assuming those fixes cover it. Unsupported human cohorts remain suppressed. Unavailable retained-code/failure-signature/fresh-task-growth metrics remain explicit.

## Reproduce with no credentials

```sh
npm run test:catalog-contracts
npm run test:owner-rpc
node --import tsx --test packages/developer-profile/*.test.ts apps/ingest/src/*.test.ts
npm run typecheck
```

Use Node 22. The native check reads the exact approved binding from source config, compiles the actual ingest entry module and calls its named RPC through local Workers with synthetic R2 only. It rejects bucket/SQL methods, ID/hash/wrong-secret misuse, foreign participants and tombstoned owners. Pure tests execute the actual fixed SELECT over synthetic SQLite fixtures and cover pages, full attempts, budgets, gaps/conflicts/mixed revisions and fetch/body deadlines. They do not prove live Basin/RPC operation.

Full `npm test` and production/Cloudflare builds now require an existing authorized ignored managed-catalog copy, or trusted CI's existing dedicated read secret. Do not reconstruct one from removed repository material, add embedded solutions, broaden credentials or substitute stale generated outputs. Private check details belong only in `.local/checks`, never public CI logs/artifacts. Pre-integration baseline was 268 passing tests plus production/Cloudflare/ingest builds; post-integration evidence must be reported separately and honestly.

[Metric inventory](developer-profile.md), [approved access/lifecycle/limits](eng-340-private-history.md), [synthetic screenshots and walkthrough](eng-340-evidence/README.md).

## Known limits to assess

Up to 100 candidate attempt IDs per read, admitting a whole-attempt prefix of at most 25,000 observations / 6 MiB of UTF-8 payloads. At most 100 displayed attempt revisions, 10,000 observations / 4 MiB per attempt, 16 MiB upstream / 256 KiB response and the existing 15-second SQL fetch/body deadline. Response projection shortens the prefix further when needed and returns an advancing cursor rather than failing the entire response. Client continuation is automatic, paced at 61 seconds to respect the existing owner limit, bounded to 20 pages and 100 displayed slots, and canceled by privacy/reset/unmount boundaries. Available pages remain visible after a later failure; partial coverage stays explicit. Over-budget completion stays unknown. No result cache. Two concurrent SQL queries and one new query/owner/minute are **per isolate**, not a global billing cap; owner approved possible query costs. Pagination sees current snapshots, can miss late arrivals behind the cursor and is not an atomic export; restart from page one for a fresh view. Unknown external assistance and missing capture still limit inference. Deletion cannot recall data already legitimately delivered to a browser; current-page boundary notifications and fresh request authorization are enforced.

Please report concrete findings with severity, file/line, a synthetic reproducer, impact and required correction. Distinguish blockers from improvements and pending live verification. Approval of the binding is not a security-review conclusion or dashboard release approval.

## Root review follow-up: timeline vocabulary (P2)

Review of exact head `2746eeb` found the uploaded projection accepted run labels such as `passed`/`errored`/`timed-out`, while the interpreter actually emits `result`/`user-error`/`runner-error`/`timeout`. It also omitted `errored`/`cancelled` submission verdict labels. The projection now accepts only the actual typed terminal vocabulary: both `examples` and `submit` purposes × `result`, `user-error`, `runner-error`, `timeout`, `cancelled`; submission verdicts `passed`, `failed`, `errored`, `cancelled` with numeric check/rule counts. Queued/running are not terminal checkpoints. Unknown purposes/outcomes/free text stay excluded.

Round-trip regressions derive each allowed outcome from synthetic observations, pass the same records through the actual SQL/result projection and compare full timelines (including timestamps). Exhaustive typed records make future capture-vocabulary additions fail typechecking until reviewed. Negative tests preserve the code-free boundary for arbitrary outcome/checkpoint text, run error text and rule IDs. This fixes a projection bug without changing capture or metric definitions. See the [explicit source-versus-live binding receipt](eng-340-private-history.md#explicit-configuration--deployment-receipt); no live binding/history configuration is claimed.


## Local larger-batch verification (not deployed)

39 focused reader/client tests and app typecheck pass. Physical DataFusion 50.1 execution agrees with SQLite on eight synthetic scenarios, including a 105-attempt input, 54,000-row input record-budget test and UTF-8 payload budget. The 54,000-row case returns 18,000 observations plus continuation; the UTF-8 case returns two 3 MiB payloads, with the third deferred. Encoded transport sizes remain below 16 MiB. The Python query-engine process peaked at about 413 MiB; that is a local engine measurement, not a web Worker memory claim.

A separate real transport/projection invocation with 100 short synthetic attempts produced a 158,455-byte response from a 1,301,276-byte joined-row upstream body in 53 ms locally. Node heap went from 10.1 to 24.1 MiB, process peak RSS about 116 MiB; these are not native Worker memory/latency guarantees. Isolated Chromium at 1280px and 390px rendered all 100 solves from one request, with uploads blocked and no overflow. Controlled-time tests cover continuation, duplicates, partial failure, bounded429 retries, cached partial status and stealth/reset cancellation. Independent source review cleared the prefix/cursor and ownership boundaries after a variable-length cursor sizing repair.

Native Basin reproduced a distributed planner defect in the deployed outer-UNION shape over excluded synthetic observations: `partition 1 not available. The head plan ChildrenIsolatorUnionExec of the stage just has 1 partitions`. The replicated workload exceeded the per-attempt observation limit, leaving the observation branch empty. The same workload succeeds with the repaired single-SELECT LEFT JOIN shape. The final bounded query also succeeds natively for ordinary stored synthetic observations (14 joined rows), a metadata-only oversized attempt (1 row) and empty history (0 rows). These controls use no real participant values. The native error belongs in engineering records, not player copy.

The owner’s actual request was independently captured as HTTP503 with fixed category `storage-http-400`, Worker outcome ok and no uncaught exception. This native query fault matches that failure class, but only an approved production repair and a fresh owner-history read can prove it resolves that specific request. It does not establish that every historical recording exists or is complete.
