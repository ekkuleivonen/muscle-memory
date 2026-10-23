# Evidence before interpretation

This is the agreed direction for the next Foundation data contract. It is not a description of instrumentation already enabled.

Two primitives underpin the data model:

- **Versioned artifacts** preserve exact presented content: Adventure sequence/presentation, Challenge, starter files, tests, hints, environment and seed configuration.
- **Ordered observations** reference those artifacts and preserve disclosed activity inside the Challenge workspace. Each observation has a stable ID, schema version, source sequence, client occurrence time and server receipt time when received. Gaps, dropped capture and truncation are explicit.

Candidate observations include attempt lifecycle, hints, runs and submissions; workspace edit deltas with recovery snapshots; code revisions, execution inputs/outputs/errors and test-level outcomes; exposure, available tools, assistance declarations and the applicable consent version. These are contract requirements to refine before collecting them, not a request to instrument every browser action.

## Capture boundary

Lossless means within the declared capture, size and retention boundary. It does not guarantee deterministic replay under every environment. Capture stays inside the Challenge workspace: no unrelated browsing or clipboard history. Disclose detailed editing capture, handle sensitive submitted code, and define deletion and retention before collection. Immutable while retained does not mean undeletable.

Preserve bounded original submission evidence even when parsing, execution or assessment fails. Normalized outputs and final scores cannot replace the input observation. If evidence exceeds a limit, record what was omitted instead of silently calling it complete.

## Derived assessments

Assessments, scores, skill estimates, flags and rankings are independently versioned projections. They reference artifact and observation IDs plus evaluator/environment versions. Reassessment creates a new projection; it never rewrites captured evidence or earlier results. Recompute where retained inputs and environment permit, and record limitations otherwise. Comparative scoring remains provisional until calibrated.

## Current implementation and next slice

The current `attempt.assessed` v1 envelope is a bounded local reference: exact manifests and encounter context, parsed JSON outputs, hints/assistance, consent version and start/submit timestamps plus fixture assessment. Active time is unmeasured and research consent is false. It is not a raw observation stream.

`createAttemptEvent` calls assessment before returning an event; SQLite verifies that assessment before storage. Malformed JSON is rejected by `parseOutputs`, and unsupported scoring versions reject event creation. Original submission text, failed submissions, source sequences, server receipt times and edit/run timelines are not retained. Optional browser history and the synthetic SQLite/export demo prove local adapters, not complete evidence capture.

The next bounded example should store and export one synthetic submission observation even if its derived assessment fails, then separately produce a projection referencing its evidence. Reuse existing retry/deletion boundaries. Do not add telemetry, a message bus, an analytics cluster or real participant collection to demonstrate that contract.

## Identity

Use Clerk for the separate personal consumer application; do not implement an authentication system ourselves. Provider setup and sign-in are not implemented yet. Guest practice and optional later sign-in for cross-device history remain proposed. Keep account identity separate from pseudonymous research IDs. Sign-in never implies research consent.

Cloudflare Access protects the owner-only development preview and is independent of player authentication. Provider account creation, credentials and paid commitments are separate setup decisions.
