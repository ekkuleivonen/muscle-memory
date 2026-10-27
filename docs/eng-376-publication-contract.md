# ENG-376 publication/acknowledgement contract — draft implementation approved, live approval pending

## Draft contract, pending live approval

Publication means a comparison response's **server authorization**, not network delivery. After a server acknowledges a stealth/age-exclusion/deletion change, no new comparison may be authorized against the old privacy generation. A response authorized before that acknowledgement may still arrive afterward. Already downloaded aggregates cannot be recalled. Local changes are immediate, but an offline/pending change is not a server acknowledgement. The requester approved refining this contract in draft code; all live authority remains approval-gated. Two CONTROL checks do not establish it, or a stronger delivery-time guarantee.

The draft uses a generation fence in the existing CONTROL bucket, with at most three CAS attempts per operation. No new scheduler, service, database, credential or live configuration is part of this draft. The disabled draft now implements the fence; two member checks alone are still not a substitute for final authorization.

## Exact authority and state

Existing browser → **muscle-memory-ingest** route `POST /ingest/v1/participants/<id>/comparison-privacy`, original device secret only:

- `{action:"read", secret}` returns only this browser's comparison state (or absence/pending), after ownership and tombstone checks. No arbitrary ID read without that ID's original secret. It never returns a proof or secret.
- `{action:"update", secret, expectedRevision, stealth, age}` writes the same coarse existing preferences. `age` is `adult`, `non-adult`, or `unknown`. Conditional R2 ETag writes reject stale tabs. Unknown never means adult. A conflict is read for review, never blindly overwritten. No first-owner claim is added.
- Current draft storage is `comparison-privacy/<id>` = `{stealth, age, revision}`. The fence protocol includes `acknowledged:boolean`, so an interrupted write cannot be mistaken for a completed exclusion acknowledgement by a later read. A pending state may disclose its revision to its authenticated owner for an explicit retry, but cannot yield a confirmed UI state. No client time, full profile, code, event, secret or proof is added.

Existing web **muscle-memory** → existing **muscle-memory-ingest**, separate named entrypoint **ComparisonEligibility**, proposed service binding **COMPARISON_ELIGIBILITY**:

- `check(members:string[]): Promise<(string|null)[]>`: at most 100 unique validated internal browser IDs. Current non-stealth, acknowledged adult state and no tombstone are required. Returns aligned state revisions/null only. This method and its acknowledgement predicate are implemented in the disabled draft.
- `generation(): Promise<string|null>`: read of the current global comparison generation. Missing/control failure suppresses comparisons. No caller-selected key/path.
- `authorize(generation:string): Promise<boolean>`: final R2 conditional put on the fixed fence key, validating the requested generation and updating only a random authorization nonce. False/error means no public aggregate. No caller SQL, records, profiles, proofs, secrets or generic storage access. Bounded CAS contention fails closed; no unbounded retry.

The global object is exactly `comparison-publication/fence` = `{generation:<server UUID>, authorizationNonce:<server UUID>}`. No member IDs, publication history, demographic slices or raw rows are stored there. Changing the nonce gives authorization an atomic R2 ETag condition even when the generation is unchanged. A process-local lock or ordinary generation GET cannot replace the conditional put.

Existing ingest deletion is also within the proposed authority change: it must advance this fence after its tombstone persists and **before acknowledging comparison exclusion**. The approved `ParticipantOwner.verify` RPC is unchanged. Existing CONTROL binding and web's existing server-only `ADMIN_STATS_SQL_TOKEN` are reused; no copied secret, new R2 binding on web or token permission expansion.

## Ordering, failure and recovery

A privacy update conditionally writes a provisional state with a new server revision and `acknowledged:false`; advances the global generation with a bounded CAS loop; conditionally finalizes that same state as acknowledged; then returns success. A finalization conflict/error never returns success. Provisional states never qualify as members. A later original-secret read returns pending, not confirmation; the owner may explicitly retry using the displayed current revision. A retry may create a new revision/generation; idempotent transport retry is not permission to undo a different preference. Every successful update, including re-enablement, advances the generation. Delayed telemetry never touches either object.

Deletion persists its tombstone first, then advances the global generation before success. Failure after a tombstone is written may have stopped uploads already, so the client keeps its local data/key and says confirmation is pending; it must not claim “nothing was deleted.” The proof is retained until fence advancement and privacy cleanup succeed, so retrying an interrupted deletion still proves ownership and finishes invalidation. Once the proof is removed, the tombstone already has a completed invalidation; an already-deleted retry needs no further mutation. The original device-secret deletion authorization boundary is preserved. Physical erasure timing/retention promises are unchanged.

A builder reads generation **before** reading candidates/current eligibility and computing aggregate-only output. An authorization against that same generation is required before publication. A privacy acknowledgement necessarily advances the generation before any later authorization can succeed. Changes while a build runs invalidate its candidate result; missing CONTROL, a CAS conflict, interrupted mutation, malformed state or fewer than 20 eligible browsers suppresses it. Privacy changes after final authorization do not revoke that already-authorized response. This is an explicit contract boundary, not an elimination of the last delivery interval.

`publication-contract.test.ts` exhaustively interleaves the read/check/authorization and write/invalidate/acknowledge steps in a small reference model (20 orderings per exclusion type), and separately demonstrates late delivery of an earlier authorization. These tests specify the proposal, **not production fencing verification**. The implementation additionally has deterministic conditional-write interleavings for partial operations/deletion retry and native local Workers checks of actual R2 CAS behavior; native Basin remains separately coordinated.

## Interface for the separately owned scheduled cache

Hourly precomputation is a reasonable initial cadence for historical outcome distributions. Privacy validation is needed on **every** serve, independent of that cadence. This writer adds no scheduler. Public `cohort()` requests no longer launch SQL, including if someone flips the source flag prematurely; they remain unavailable until the separately reviewed artifact reader is installed. `precomputeCohort()` is the disabled internal candidate-builder seam.

The proposed aggregate-only artifact shape is `{version,challenge,revision,window,computedAt,expiresAt,generation,groups}`. Pure build/serve interfaces are implemented in `packages/statistics/human-snapshot.ts`; persistence and scheduler integration remain separately owned. A build spec includes a trusted pinned runtime, which serving must match too. The trusted build may hold browser IDs transiently for eligibility checks; **never cache eligible members as authoritative state**. The member list must not be public. Publication requires `authorize(artifact.generation)` at serve time. A generation mismatch invalidates every old artifact, including still-fresh hourly entries: suppress until a new scheduled computation; never serve stale eligibility under a TTL. The cache owner can propose an earlier rebuild on invalidation, but its cost/work queue is outside this privacy draft.

These generation reads/conditional writes are per-server-operation controls, not a global spending cap. No stale-while-revalidate fallback may bypass privacy authorization. Personal local answers remain immediate; the report should continue to use only tiny matched metric FYIs, with no additional comparison chapter or internal-control UI.

## Configuration proposed, none installed

After explicit control-authority approval and separate final release instruction: ingest `COMPARISON_PRIVACY_ENABLED="true"`; web service binding `{binding:"COMPARISON_ELIGIBILITY",service:"muscle-memory-ingest",entrypoint:"ComparisonEligibility"}`. Browser transport remains source-disabled until the protocol and disclosure review pass. `COHORTS_ENABLED=false` stays unchanged in this task. No merge, deployment, live access, paid runs or native Basin query is authorized here. Independent review, native Basin coordination and scheduled-cache integration belong to the requesting owner.
