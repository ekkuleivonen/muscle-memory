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

Five attempt IDs/page, at most 100 displayed attempt revisions, 10,000 observations/4 MiB per attempt, 24 MiB upstream/256 KiB response and 15-second SQL fetch/body deadline. Over-budget completion stays unknown. No result cache. Two concurrent SQL queries and one new query/owner/minute are **per isolate**, not a global billing cap; owner approved possible query costs. Pagination sees current snapshots, can miss late arrivals behind the cursor and is not an atomic export; restart from page one for a fresh view. Unknown external assistance and missing capture still limit inference. Deletion cannot recall data already legitimately delivered to a browser; current-page boundary notifications and fresh request authorization are enforced.

Please report concrete findings with severity, file/line, a synthetic reproducer, impact and required correction. Distinguish blockers from improvements and pending live verification. Approval of the binding is not a security-review conclusion or dashboard release approval.
