# Challenge management — ENG-354 draft

Status: implementation design and local work only. No cloud resources, production
migrations, merge, deployment, provider calls or new event schemas authorized.

## Inspected baseline

Main `8ec608414bcfc4ea8c33f21802e070def7f84821`: 69 challenge folders and 117
immutable revision archive files. The web Worker imports a catalog generated from
repository sources. It currently has no content-storage binding. Its admin shell
and APIs share signed Access assertion and same-origin mutation guards.

Read-only account inventory found no Muscle Memory D1 database and no content R2
bucket. Existing project R2 resources serve ingestion/research and are not to be
repurposed. The current ingest Worker and player event schemas remain unchanged.
Historical ENG-309's Adventure/lifecycle package is absent from current main; do
not restore it. Reuse current `validateRevision`, catalog/hash verification,
`publishProblems`, runtime manifest and sandbox Runner instead.

## Proposed storage and lifecycle

- One new private R2 bucket (`muscle-memory-content`) for content-addressed public
  revision snapshots and separately namespaced private draft/validation material.
  No public bucket access or direct object URLs. Published reads use a server
  allowlist/projection and verify their hash; never return a private draft bundle.
- One new D1 database (`muscle-memory-catalog`) for challenge identities, optimistic
  draft generations, immutable publication registry, lifecycle/current pointer,
  exact-version QA receipts, transactional operator audit and publication intents.
- R2 immutable writes precede a D1 compare-and-swap publication transaction. The
  transaction switches the live pointer and records audit plus durable benchmark
  intent together. Partial object writes must not expose a version. Unreferenced
  objects can remain; no destructive garbage collection in this issue.
- Editing invalidates QA for that draft generation. Publication compares expected
  generation, content/private/runtime digests and completed validation receipts.
  Runtime code runs only in the existing opaque-origin browser sandbox, never the
  application server. Client transcripts, including fabricated expected outputs,
  cannot create a QA receipt. The server must invoke a trusted browser-execution
  capability and grade its returned raw runs; no capability means publication is
  blocked. A checkbox or operator-browser report is not a trusted QA result.
- Publish does not wait for models. Intent status is explicitly blocked/unconfigured
  while owner decisions on events, protocol, model set and budget remain open. No
  invented model/protocol revisions, provider calls, run statuses or paid retries.
- Unchanged republish restores the same version and preserves prior evidence and
  intent. Changed content/runtime requires a new immutable version and fresh QA.
- Archive is reversible lifecycle state, not deletion or emergency disable. It
  removes discovery/new-start affordances while keeping pinned active attempts and
  historical/shared views. This requires public historical revision loading and a
  local continuation gate; do not silently treat current content as an old version.

## Integration gaps to resolve explicitly

`getChallenges()` currently caches a catalog promise for the server instance's
lifetime. Managed publication must replace that behavior with current state, while
immutable revision reads may cache by hash. Server-rendered public discovery must
also see lifecycle changes without a rebuild.

Practice routes currently send only the latest revision, and local progress does
not carry a revision pin. Preserve active attempts using their recorded pinned
revision and saved code; do not create new player observations or reinterpret old
ones. Existing immutable archives must be seeded and remain readable. Shared
receipts must remain visible for archived challenges without an invitation to start
an archived challenge.

Current content hashes do not include a runtime manifest pin. Define the immutable
publication/validation envelope so runtime changes invalidate QA and version
eligibility, preserving all existing content hashes and recorded history. Do not
invent human/model instrumentation to solve this content-versioning problem.

## Local implementation and approval plan

Implement the storage contract and transactional transitions first, with migrations
and real local D1/R2 fixtures. Add authenticated draft APIs and small labeled forms,
then exact-version sandbox validation and guarded publication/archive actions.
Test stale edits, simultaneous publish, idempotency, object-write failure, retry,
private/public projection, archived continuation and actual browser mutation paths.

Before any live action, request approval for the exact new resources/bindings,
production schema migration and seed of the frozen current catalog/archives. Verify
seeded hashes/counts before switching public reads to managed mode. An unconfigured
installation must retain its existing bundled player catalog and clearly label
admin storage unavailable. Configured managed storage failures must be explicit,
not silently resurrect archived challenges from the bundle. No credentials or
security policy changes are included in this draft authorization.

ENG-353's authenticated inventory and protected catalog API were subsequently
verified read-only in the owner's existing Safari session. A fresh request did not
reproduce the earlier blank observation. No new OTP or policy change was needed. ENG-355
statistics and ENG-342 model execution remain outside this implementation.

## Trusted runtime validation tradeoff

R2 and D1 provide persistence, not a trusted browser runtime. The draft now rejects
client transcript finalization and client pass flags. Private receipt writing is
reachable only through a server-owned validator capability, with exact draft and
runtime bindings, a single-use validation session and independent case grading.
Beginning validation clears an old pass atomically and advances the generation,
so a concurrent publish cannot use a superseded receipt.

The lean recommendation is an operator-side CLI using the existing sandbox Runner
and local headless Chromium on Mac/dev-01. The authenticated UI queues an exact
saved generation; only trusted tooling with direct storage authority may claim the
job and write its independently graded receipt. There is no browser receipt upload
endpoint, new signing credential, hosted validator Worker or Browser Run binding.
Private source never goes into public CI artifacts. Manual operator attestation is
not implemented and must not be described as automated execution.

A standard Worker cannot execute the existing browser/WASM/DOM runtime safely as
application code. D1/R2 alone cannot supply that runtime. Existing repository
publish checks already execute the sandbox in Chromium, so the CLI reuses that
approach rather than adding a hosted browser service. Generic green CI is not an
exact private-draft receipt: current CI has no private draft access or trusted
receipt-write channel. Adding that channel would require a separately reviewed
credential/data path. The local CLI currently has no remote mode.

Local queue execution is automated runtime QA with operator-machine provenance;
it is not independent human testing. Latency is the sum of real planned runs and
queue delay, with one heavy job at a time. There is no new hosted usage charge.
Publication remains blocked until the exact job succeeds. Production activation
still needs a reviewed remote storage adapter and approval for its existing-account
access, plus a choice between explicitly running the CLI per queued job and an
always-on process on the existing host. No daemon or credentials were installed.
A hosted browser could be considered later if unattended availability justifies
its additional service, binding, resource limits and usage costs.

Actual local seed verification has created only gitignored emulator state: 69 heads,
117 hash-verified public revisions, 69 digest-verified private sources and a 69-item
active manifest. Repeating the seed leaves state unchanged. No seed QA passes are
fabricated. Default CLI invocation is plan-only and has no remote mode.

## Local verification checkpoint

Real Miniflare D1/R2 plus trusted Chromium integration passed 11 scenarios: complete
69/117 seed, private draft isolation, concurrent saves, actual D1 constraint rollback
after R2 writes, R2 outage, lost committed reply/retry, exact-source runtime grading,
concurrent shared-manifest publication/retry, immutable version/intent idempotency,
archive/history preservation and rejection of a reference exceeding player timeout.
The effective player timeout is shared with QA and included in the runtime pin.

A built-Worker fixture using ephemeral signed identity keys passed 12 HTTP checks,
including anonymous/forged/wrong/expired identity, cross-origin and alternate-host
rejection, malformed create, client transcript/pass-flag rejection and publication
without QA. Its authenticated Chromium UI flow edited a draft, queued validation,
ran the trusted local worker, published, archived and checked a 390px viewport.
Operator navigation created no player records or uploads. These are local fixtures,
not live Access/storage proofs. The browser test creates its initial draft through
the real authenticated API; filling the entire create form, archived in-flight
continuation and full missing-storage browser recovery remain follow-up coverage.

The validator deployment choice remains open with the owner: dependency on an
existing Mac/dev-01 worker versus a self-contained hosted service. The local CLI is
a reusable trusted adapter demonstration, not an approved production UX dependency.
Queued UI state does not promise worker availability; expired jobs fail closed.
