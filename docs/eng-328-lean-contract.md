# ENG-328 practice and compatibility contract

The earlier proposal and workplace implementation are preserved in Git history (`c6e2a6b`, local `archive/eng-328-workplace-c6e2a6b`). Dot's subsequent decisions supersede its pending capture gate and ownership proposal. The active contract below implements the approved narrow change; no further approval is pending for these paths. Dot retains integrated review/release ownership. No child merge or deployment.

## Keep / change / remove

The pre-implementation [loop inventory](eng-328-loop-audit.md) and earlier version of this contract preceded the shell changes. Revised direction: keep independent editing, keyboard focus, immutable revisions, save/recovery, pause/resume, cancellation/retry, browser sandbox and deterministic checks. Change the working area to challenge → code → feedback → next challenge. Keep Explore as a separate searchable/filterable catalog and Profile as factual evidence outside practice. Remove workplace chrome, board/status choices, public PR creation/push/merge and manual Resolve from practice. Historical links/records remain readable. Do not force company stories or expand the catalog.

Practice shows the published goal, visible Input/Expected output examples, applicable authored requirements and editable source. Current multi-file challenges retain a source selector; no file explorer or generated test source is shown. Existing public notes/constraints and read-only supporting material stay directly accessible, open by default, so older content does not lose required API details or log/doc requirements before ENG-329 normalization lands. Requirements are public before Submit. Submit runs the full suite; Run examples remains a secondary, public-only check. Neither changes `RunPurpose` or workspace capture semantics. Ctrl/Cmd+Enter submits; Escape then Tab leaves the editor. Feedback preserves focus. Next challenge is the sole primary action after current verification, without automatic navigation. Existing deterministic recommendation factors are language, project/category and difficulty; this is not adaptive learning.

## Ownership

ENG-328 owns route composition, catalog/arrival wiring, the completion writer, narrow schema/ingest changes and this compatibility contract. ENG-329 owns diagnosis and feedback components: `checkFeedbackOf`, `CheckFeedbackView`, `diagnose`, fixed hidden failure categories and required-rule presentation. Its `df06ebf` is the pinned stack dependency, including the later run-level hidden-error fixes (`a15796b`, `2a6d6c0`, `df06ebf`). The subsequent `7c09d35` catalog normalization is deliberately not included; the shell keeps current multi-file and pinned historical content compatible. No competing completion writer is consumed. ENG-332 owns share artifacts/serialization; the narrow `CopyIssueLink` wording hunk from PR #42 (`13f8d07`) is composed as a secondary control and does not include code. No other share serialization/outcome changes from that PR are included. Its solution-outcome sharing integration remains for the combined release. ENG-330 owns homepage/story copy; ENG-331 owns selected hooks. No content, telemetry/consent/legal, identity, export/reset or model-comparison redesign is part of this stream.

## Exact-code completion gate

`apps/web/lib/completion.ts` is the new completion eligibility reader. It reuses existing exact saved-artifact/revision matching, but evaluates required correctness/safety rules against the checked artifact without consulting manual Resolve or replies. Style nits do not block. Completion needs:

- A terminal, completed test-phase outcome from the full suite, every expected case present, every JSON result correct and no case error, conversion error, truncation or missing output.
- The latest internal submission/run; no newer unreported full run, including starts in the same millisecond. Older late results cannot take precedence. Pending, failed, timed-out, cancelled, runner-error and malformed results cannot complete.
- A published revision exactly matching the open/pinned revision, submitted artifact and terminal run. Pinned old published revisions remain valid; the live revision is never substituted.
- Every editable file present and exactly matching saved and current editor text. Missing/truncated artifacts, pending/buffered/retrying saves and edits block completion.
- All deterministic authored blocking rules clear on that exact code. Fixing code clears a rule; no Resolve ritual can override it.

`complete-practice.ts` calls `PracticeStore.commitWorkspace`. A single IndexedDB readwrite transaction re-reads persisted records, rechecks live editor/save/runner state and eligibility, then appends completion and result observations plus their outbox entries atomically. Transactions serialize concurrent writers. A failure rolls back both; repeated Submit/reloads cannot append duplicate completion within an attempt. Local board cache becomes Done only after commit. No background completion is synthesized on resume. Existing explicit replay boundaries remain unchanged. Editing after completion invalidates current verified status without erasing the immutable previous completion.

## Approved additive capture change

`packages/domain/board.ts`: `BoardMoveTrigger` adds `checks-passed`; board capture **7.1.0 → 7.2.0**. The existing `observation.board.moved` envelope and fields are retained. `to: done`, original Submit `via: pointer|keyboard`, existing positive internal `pullRequest` number and exact `runId` identify the checked submission. **via records the causal Submit gesture, not an automatic click.** No automatic user gesture is fabricated. There are no new data categories, fields or keystroke collection.

The internal full-suite `purpose: pull-request` and `observation.workspace.pull-request` submission record are temporarily retained with their literal recorded meanings. Public practice calls this Submit. `local` still means visible examples only. Workspace capture remains **6.0.0**; this change does not relabel local runs or broaden their scope. A new checked completion is never written or read as a historical merge. `allPullRequests` continues reporting the internal submission as open; the new `completions` projection distinguishes checked completion from old literal merged completion.

`observation.board.result` still uses metrics version 2 and the existing first-finish fields, computed at the completion timestamp within the current explicit attempt. No metric or aggregate schema changes. `attempts.ts` keeps its old replay boundaries. `profile-evidence.tsx` reads completion facts; no skill score or invented aggregate/model comparison is presented.

`packages/domain/ingest.ts` retains accepted 6.0/6.1/7.0/7.1 board versions and accepts 7.2. `checks-passed` requires 7.2, valid existing move fields and issue/pinned revision. Shared `validateBoardMoveData` validates the real constructor and ingest path. `apps/ingest/src/index.ts` handles mixed old/new batches without rewriting raw payloads. No migration/deletion. Existing historical PR, merge, Resolve, result cards, shared URLs and artifact readers keep their literal meaning; old submission routes are now read-only and lead back to practice instead of offering merge/Resolve/reply writes.

## Hidden-check boundary

ENG-329's unconditional hidden expected-value exposure in `91f1521` is explicitly rejected. `bf94f27` supplies generic hidden labels and fixed failure categories. Practice integrates that protection in feedback and transcript/output. Hidden input, name, expected/actual value, error message/type, trace and printed streams stay hidden. Public examples retain detailed expected/actual feedback. Authored public rules describe requirements, not hidden solutions. No hidden-test oracle is introduced.

## Verification paths

- `completion.test.ts`: exact live/saved/pinned code, complete outcomes, stale/local/pending/failed/malformed runs, same-millisecond ordering, blocking-rule correction independent of Resolve, real transaction rollback/concurrency/outbox, ingest validator and literal legacy reader semantics.
- Domain constructor tests and `apps/ingest/src/index.test.ts`: real new constructor/validator/HTTP ingest, mixed old/new fixtures, wrong version/missing run rejection, payload preservation; old version acceptance remains tested.
- `tools/aggregates/test_aggregate.py`: old/new metrics-2 result fixtures aggregate together, checked move ignored as a metric, first-finish deduplication unchanged.
- `tools/browser/practice-check.ts`: real browser sandbox, keyboard Submit failure/green/recovery, public-only runs, hidden redaction, cancellation, asset retry, save/resume, stale edits, recorded 7.2 completion/6.0 run causation, required-rule blocker/correction, profile, read-only legacy URL and mobile layout.
- `challenge-presentation-check.ts`: Explore keyboard search/filtering, project/category grouping, legacy status query URLs, exact published examples and editing continuity.

Run commands and actual results/screenshots are recorded in [verification](eng-328-verification.md). No benchmark, human validation or deployment is claimed.
