# Evidence before interpretation

This is the agreed direction for Foundation data contracts. Only the synthetic local submission example below is implemented; no instrumentation is enabled.

Two primitives underpin the data model:

- **Versioned artifacts** preserve exact presented content: Adventure sequence/presentation, Challenge, starter files, tests, hints, environment and seed configuration.
- **Ordered observations** reference those artifacts and preserve disclosed activity inside the Challenge workspace. Each observation has a stable ID, schema version, source sequence, client occurrence time and server receipt time when received. Gaps, dropped capture and truncation are explicit.

Candidate observations include attempt lifecycle, hints, runs and submissions; workspace edit deltas with recovery snapshots; code revisions, execution inputs/outputs/errors and test-level outcomes; exposure, available tools, assistance declarations and the applicable consent version. These are contract requirements to refine before collecting them, not a request to instrument every browser action.

## Capture boundary

Lossless means within the declared capture, size and retention boundary. It does not guarantee deterministic replay under every environment. Capture stays inside the Challenge workspace: no unrelated browsing or clipboard history. Disclose detailed editing capture, handle sensitive submitted code, and define deletion and retention before collection. Immutable while retained does not mean undeletable.

Preserve bounded original submission evidence even when parsing, execution or assessment fails. Normalized outputs and final scores cannot replace the input observation. If evidence exceeds a limit, record what was omitted instead of silently calling it complete.

## Derived assessments

Assessments, scores, skill estimates, flags and rankings are independently versioned projections. They reference artifact and observation IDs plus evaluator/environment versions. Reassessment creates a new projection; it never rewrites captured evidence or earlier results. Recompute where retained inputs and environment permit, and record limitations otherwise. Comparative scoring remains provisional until calibrated.

## Current implementation

The legacy `attempt.assessed` v1 envelope remains a bounded local reference: exact manifests and encounter context, parsed JSON outputs, hints/assistance, consent version and start/submit timestamps plus fixture assessment. `createAttemptEvent` scores before the event exists and SQLite re-verifies that score, so malformed or unscorable submissions are rejected rather than stored. It is kept for the browser history and `demo:events`, labelled as an assessed snapshot. It is not raw evidence and is not converted into it.

The capture-first example inverts this for one synthetic submission (`packages/domain/evidence.ts`, `packages/domain/projection.ts`, `packages/storage/evidence-sqlite.ts`, `npm run demo:evidence`):

- **Content artifacts** hold the exact published Adventure and Challenge, keyed `<kind>.<id>.<version>` and shared by all participants. They hold published content only.
- **Submission artifacts** hold the original text exactly as entered (whitespace and invalid JSON included), owned by one participant. Capture `synthetic-submission-capture-1.0.0` keeps at most 64 KiB of UTF-8, cut at a character boundary and keeping any leading byte-order mark, and records original and captured byte counts and `truncated`.
- **Submission observations** carry a stable ID, schema version, source ID and sequence, client occurrence time, an explicit `serverReceipt: {status: "absent", reason: "local-only"}`, capture and consent versions, `researchConsent: false`, the encounter, hints, assistance and references to the three artifacts. `captureGaps` lists what this capture does not record: workspace edits, code revisions, runs and execution output, active time, and `submission-truncated` when the bound applied.
- **Assessment projections** reference observation and artifact IDs plus evaluator and environment versions. A projection ID is `<observationId>.assessment.<128-bit SHA-256 prefix of the evaluator and environment IDs and versions>`, so a change to either appends a new projection. Observation IDs are at most 64 characters, keeping derived IDs within the 128-character bound. The outcome is `assessed`, `parse-failed`, `unsupported`, `rejected` or `not-assessed-truncated`. A prefix is never scored as a whole submission.

Artifacts, the observation and their pending exports commit in one transaction before anything is parsed. Projections are appended afterwards from the stored evidence. A parse failure or unsupported formula becomes a projection outcome; it never removes evidence. Reassessment with a new evaluator version appends another projection. Recomputing the same version reproduces an identical record and deduplicates. Retry, conflict, export and deletion behaviour is in [local events](local-events.md).

**Source order.** A source stream is one participant's one source ID. Positions start at 1, are positive safe integers and never reset: a restarted source (new process, device or tab) uses a new source ID. The store validates the position itself and, in the capture transaction, rejects a different observation ID claiming a taken position, leaving evidence and the outbox unchanged. An identical retry is still a duplicate. `sourceStream(participantId, sourceId)` (pure logic in `packages/domain/source-order.ts`) reads observations by sequence, not arrival, and reports missing ranges before the highest captured sequence. Only the first 100 ranges are listed, with total range and position counts, so huge sequences stay bounded. A missing position was not observed. It is not evidence that nothing happened, and positions after the highest sequence are unknown rather than missing. A late arrival for a free position is a new record; it never rewrites earlier observations. Gaps never block or drop captured evidence. Records stored before these checks are kept: shared positions are reported as `conflicts` and non-integer sequences as `unordered`. Order is derived from the observations themselves, so exported observation files reproduce the same stream.

Remaining gaps: no browser or editor capture, run, execution or test-level observations, and no server receipt. Source streams carry no clock-based ordering across sources. The store checks that shared artifacts are published-shaped content; it does not verify them against the catalog, so the CLI gates starts on the published catalog. Projections have no creation time, so identical recomputation deduplicates; they list in ID order, not creation order. The browser app still parses before storing. Review the instrumentation and consent boundary before enabling any collection.

## Identity

Use Clerk for the separate personal consumer application; do not implement an authentication system ourselves. Provider setup and sign-in are not implemented yet. Guest practice and optional later sign-in for cross-device history remain proposed. Keep account identity separate from pseudonymous research IDs. Sign-in never implies research consent.

Cloudflare Access protects the owner-only development preview and is independent of player authentication. Provider account creation, credentials and paid commitments are separate setup decisions.
