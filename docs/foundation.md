# Foundation contract v1

## Ownership and boundaries

Adventure content owns story, presentation and the ordered pinned `(Challenge id, version)` references. Challenge content owns task, fixtures, expected outputs, hints, skill tags and assessment version. Attempt owns pseudonymous participant ID, exact Challenge digest, Adventure version, complete order/position, presentation variant, clues shown, hints shown, assistance self-report, consent version, timestamps and active time. Assessment owns fixture verdicts and provisional feedback. Every persisted envelope must include a schema version.

Publish content immutably: the same id/version must never point at changed bytes or meaning. Editing any task/test/hint creates a new Challenge version; scoring changes create a new assessment version. Presentation/story/clue/sequence edits create a new Adventure version. Keep old content so historical results remain reproducible. Canonical Challenge digest covers all its contract fields. Content digests are integrity identifiers, not credentials.

The initial scorer only compares bounded JSON outputs with canonical expected JSON. It cannot tell whether someone wrote code, copied an answer, or used assistance. Preserve self-report as context; never infer cheating from coding style. Do not rank people, compare different contexts, or claim population decline or AI causation from fixture scores.

## Current executable acceptance

1. Load an authored Adventure and its pinned Challenge fixture.
2. Construct an encounter that preserves presentation, clues and order.
3. Create a synthetic, explicitly consented pseudonymous Attempt.
4. Validate timestamp order, active time, pinned content and output shape.
5. Produce deterministic provisional assessment and useful fixture feedback.
6. Reject changed content, wrong encounter, missing consent and invalid hints.

`apps/reference/demo.py` and contract tests exercise this slice. Authoring lifecycle, durable storage and exports are pending implementation, so this is not the full Foundation acceptance gate.

## Next bounded slices

### Durable attempt store and exports

Implement a local SQLite adapter outside the pure contracts. Atomically append an Attempt and its Assessment plus export outbox. Deduplicate event IDs; identical retry returns its receipt, conflicting payload fails. Persist exact snapshots (including encounter and assessment version) so replays never silently use current content. A crash between insert and export must be retryable. Export immutable JSON envelopes to a user-selected local directory using atomic replace and stable IDs; acknowledge only after successful write. A later object-storage adapter can use the same contract.

Use synthetic data while developing. Individual events and exports stay private and ignored by git; no public individual endpoint. Explicit consent precedes collection; aggregate/research consent is separate and optional. Local deletion must remove participant rows, pending exports and local export objects; document that independently copied exports need separate deletion. Avoid automatic analytics or retention guesses until a real deployment exists.

### Authoring lifecycle

Implement a manifest catalog with draft → preview → tested → published → retired plus immediate disabled. Preview may validate draft content; only published, enabled versions start attempts. Retirement stops new attempts and preserves historical reads; disable blocks new and in-flight scoring immediately. Publish pins immutable content/digests and validated references. Require new versions for edits after publish, and audit lifecycle changes locally. Test the state machine and invalid reference rejection.

### Full reference acceptance gate

Wire catalog and store into the reference CLI: draft, preview, test, publish, attempt, result, durable retryable export, retirement/disable and deletion. Demonstrate partial correctness and crash/retry paths. Use an alternate frequency task with distinct labels, retaining variant and exposure history; call it an alternative-task candidate, not a calibrated equivalent.

## Execution and operations

No arbitrary-code runner is implemented. Never pass submissions to eval, exec, a shell or an unrestricted subprocess. A future runner needs disposable isolation, bounded CPU/memory/process count/output/time, no credentials, no network/private-LAN route and validated termination. Until that exists, use bounded data outputs and trusted development fixtures only.

No hosting is required to develop the Foundation. Next.js is selected for the product app. Verify its Cloudflare adapter and build path early with local build/preview, without provisioning or paid resources. The Python contract spike is an executable behavior reference; port its contracts and fixtures into readable TypeScript rather than introducing a Python service dependency. Choose transactional app storage compatible with the selected runtime, separate from bulk archive/export storage. SQLite demonstrates a local adapter boundary; it is not a mandated Cloudflare runtime dependency. JSON exports keep the MVP portable. No analytics cluster, API billing, model benchmark schedule, monetization or infrastructure provisioning is part of this slice.

## Calibration gate

Before comparative claims or ranking, observe real consenting players, record task order, assistance and prior exposure, compare alternative forms and estimate practice/context effects. Keep correctness separate from time and hints; active time is self-reported in the prototype and is not a verified capability measure. Release any later formula with a new immutable assessment version and explicit limitations.
