# Challenge management — ENG-354

Draft implementation on baseline `8ec608414bcfc4ea8c33f21802e070def7f84821`.
No live resources, migration, merge or deployment are authorized yet.

## Operator workflow and trust

There is one trusted operator, already protected by Cloudflare Access plus server
JWT verification and same-origin mutation checks. The workflow is **save draft →
run checks in this admin browser → inspect result → publish**. No hosted validator,
Browser Run, background queue, Mac/dev-01 service, new credentials or manual CLI
step is required for normal authoring. The abandoned hosted proposal and CLI-only
validation dependency were removed.

Checks use the existing opaque-origin sandbox and pinned browser runtimes, with
the same effective timeout as players. A short-lived token pins the saved draft,
generation and runtime while the browser checks the reference twice, starter,
alternative solutions and wrong variants. Starting checks invalidates the previous
pass. Edits/runtime changes invalidate evidence; stale, expired, incomplete or
malformed submissions cannot enable publication. The server rechecks submitted
outputs against saved cases and structural rules and stores immutable private
results with provenance `operator-browser-submitted`.

This deliberately trusts the authorized operator: they can fabricate their own
browser reports. These results are not independent server runtime proof, human
research observations or model benchmarks. No enterprise adversarial-operator
infrastructure is warranted here. Stop/unmount destroys the local runner; there is
no remote job to cancel. Runner errors and code failures are shown as one actionable
message, and publication remains disabled until a passing saved result is present.

## Persistence and public content

The current app bundles 69 challenge sources and 117 immutable archives. It has no
managed content binding. Proposed storage is one dedicated private R2 bucket and
one catalog D1 database; existing ingestion/research storage is not repurposed.

R2 stores content-addressed public revisions/manifests and separately namespaced
private sources/results. Public reads use registered allowlisted snapshots and
verify their hashes. Drafts, references, wrong variants and private validation
material never appear in public APIs. Missing configuration keeps the existing
bundled player catalog and clearly disables authoring. Explicit managed mode with
broken storage fails instead of silently resurrecting archived bundled challenges.

D1 stores identities, draft generations, immutable version registry, current
manifest pointer, QA receipt references and minimal operator mutation audit.
R2 writes precede an atomic D1 batch. Generation/manifest guards prevent stale
updates and lost publication; stable request IDs reconcile uncertain replies.
Failed object or transaction writes do not partially publish. Unreferenced objects
are harmless and retained; no deletion/garbage-collection system is added.

Changed content/runtime creates a new immutable version. Unchanged restore reuses
the version and evidence. Archive replaces delete: it removes discovery/new starts
while preserving unfinished pinned local attempts, saved code, exact historical
versions and shared results. No stats reset, source ID rewrite or player schema
change is included. The original 69 identities and all 117 archives are preserved.

Publication records a durable intent with status `blocked_configuration`, not a
scheduled or completed benchmark. Event design, model roster/protocol, budget,
provider calls and ENG-342/355 remain outside this issue and unresolved with owner.

## Local checks

Real Miniflare D1/R2 plus Chromium automation covers seed/hash preservation,
private-draft isolation, concurrent saves/publications, actual transaction rollback
after object writes, R2 outage, lost committed replies/idempotency, browser result
validation, stale/expired reports, same-version restore and archive/history.
The six-second reference regression fails under the shared player timeout.

Built-Worker fixtures use ephemeral signed identities. Tests cover anonymous,
forged/wrong/expired identity, CSRF, alternate hosts, malformed QA/pass flags,
publication without QA, all create fields, save/edit-URL/reload, browser checks,
publish/archive, recoverable storage failures, mobile layout, archived continuation
and fresh-start denial, and archived shared-result rendering. All synthetic player
upload attempts are intercepted; operator activity opens no player records and
produces no player uploads. These are agent/browser fixtures, not human research or
live Cloudflare proofs. Exact final receipts are linked in PR57.

## Minimal production approval bundle

1. Create private R2 bucket `muscle-memory-content` with no public access and D1
   database `muscle-memory-catalog`. No hosted validator/Browser Run/DO/queue needed.
2. Bind these only to the existing web app as `CONTENT` and `CATALOG_DB`. Preserve
   current Access protection, workers.dev/preview disablement and public routes.
3. Apply `migrations/catalog/0001_catalog.sql` to the new empty database. Import
   current 69 sources and all 117 hash-verified archives using the reviewed seed
   plan. Seed is non-destructive and reruns do not reset existing managed content.
   The existing local seed CLI is plan/local-only; production import must use
   explicitly approved remote resource targets and verify receipts before activation.
4. Verify 69 active heads, 117 immutable versions, private source digests and active
   manifest. Then set the app variable `CATALOG_MODE=managed`. No new secrets or
   login providers are required. D1/R2/Workers normal usage charges still apply;
   there is no separate browser-service charge.
5. After exact configuration approval, merge/deploy PR57 and verify authenticated
   create/check/publish/archive plus anonymous denial and public/history behavior.
   Use an explicitly identified synthetic draft; do not publish filler production
   content or send synthetic practice to research ingestion.

Rollback preserves Access and every stored object/row. Before managed changes,
bundled reads can be restored after inventory verification. After changes, retain
a compatible managed reader and active manifest pointer; blindly returning to the
bundle could expose archived content or hide newly published challenges. No data
or resource deletion is proposed.

## Expected incremental cost

The verified seed contains 187 immutable objects totalling 1,778,898 bytes, plus
small D1 metadata/indexes. This is small relative to published included storage,
but included usage is shared with other account workloads; a zero bill is not
promised. No additional Worker, subscription upgrade or browser service is proposed.

Current [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) has no
capacity/hour charge: Free includes 5M rows read/day, 100K written/day and 5GB total;
Paid includes 25B reads/month, 50M writes/month and 5GB, with published overages of
$0.001/M reads, $1/M writes and $0.75/GB-month. [R2 Standard](https://developers.cloudflare.com/r2/pricing/)
includes 10GB-month, 1M writes/Class A and 10M reads/Class B monthly, then
$0.015/GB-month, $4.50/M Class A and $0.36/M Class B, subject to billing-unit rounding.
Egress is free. The existing web app keeps its normal [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/);
no plan upgrade is part of this request.

Read-only Workers settings showed default usage model `standard`, but that is not
proof of the account's subscription or remaining included usage. The existing
credential's subscription lookup returned HTTP403 Authentication error; it was not
retried or bypassed. Exact current plan/headroom remains unverified. Activation
approval should cover ordinary D1/R2 usage under the existing plan, with any plan
upgrade or materially different spending requiring a new decision.
