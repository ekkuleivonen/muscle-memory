# ENG-328 revised working-area contract — proposal for dot

Supersedes the workplace-loop implementation following user message Sentinel_8f763fd2c5188191950bf15d93a76760. Existing work is preserved at `c6e2a6b`, draft PR #40 and local `archive/eng-328-workplace-c6e2a6b`. That PR is not acceptance of the revised flow and must not be released as the new experience. No functional or schema changes accompany this proposal.

## Flow and ownership

The primary flow is challenge → code → immediate verification feedback → next challenge. PRs, merges, board statuses and manual Resolve are absent from the required player journey. Use the existing CodeMirror editor for editing, without copying VS Code chrome, activity bars, branches or workplace installation fiction. Show the challenge, editable source and feedback directly; additional source/test files remain accessible for real multi-file tasks. Preserve keyboard editing, focus, save/recovery, pause/resume, cancellation and runtime retry.

ENG-328 owns `/work/<KEY>` composition, shell-specific styling, keyboard/focus integration, and the separate searchable/filterable challenge catalog. Keep stable `/issues` and project/category URLs as compatibility routes; user-facing catalog label becomes Explore. Preserve URL-backed language, difficulty, kind, label and project/category filters and search. Remove board-status controls from the new catalog rather than relabeling old statuses as completion. Do not modify shared query parsing until old URLs have an explicit compatibility policy.

ENG-329 owns the verification verdict, diagnostic feedback and evidence projection. Proposed shared-file boundary: ENG-329 owns the execution/persistence contract in `workspace/session.ts` and its pure verdict reader; ENG-328 owns mounting, view continuity and shell callbacks. Supply narrow commits/hunks rather than parallel rewrites. ENG-328 consumes a verdict; it does not recompute evidence or reinterpret historical PR events.

ENG-332 owns optional sharing controls and public-safe metadata. It consumes an explicitly validated challenge verification result, independently of historical merged-result cards. Existing shared URLs, code opt-in and recipient attempts remain readable and independent. ENG-330 owns homepage story; ENG-331 supplies selected, grounded catalog/hook copy. Dot owns contract acceptance and the combined release.

A separate evidence/profile area consumes existing factual projections. Unsupported aggregate/model comparisons remain unavailable with a truthful explanation. No skill score, typing benchmark, adaptive learning, AI tutor or new collection is implied. Initial next-challenge ranking uses existing language, project/category, difficulty and explicit practice history; describe those factors plainly. Do not use old board Done as a new verification verdict.

## Proposed verification/completion gate

The primary action is **Check code**. A single execution checks the full published suite and returns feedback in place. Failed, errored, cancelled, incomplete, stale or unconfirmed checks cannot complete a challenge. A passing verification automatically presents the brief result and **Next challenge**; no separate merge, submit-to-PR or Resolve step.

The evidence owner supplies a read-only verdict with the challenge key, immutable issue revision, exact code artifact identity, run identity, suite scope/counts and one of: checking, failed, errored, cancelled, stale, unconfirmed, verified. Completion requires all of the following:

- The run finished successfully, every required case was evaluated and passed, and the full suite was used. Visible-only green is practice feedback, not completion.
- The checked immutable revision is published and exactly the revision currently open; no substitution of a live revision for an earlier pinned revision.
- Every editable file in the current saved code matches the checked artifact. Editing or opening a different revision withdraws current verified status immediately. A late older result cannot override a newer run.
- Missing/truncated artifacts, capture gaps that prevent matching, pending saves or unverifiable results are labelled unconfirmed rather than completed.
- Deterministic correctness and safety requirements remain completion blockers and are evaluated against that same artifact. They are not dismissed as advisory feedback to make completion easier. Manual Resolve and replies never manufacture verification; passing the requirements clears blockers without a Resolve ritual.

Keep completed historical attempts immutable. A current edit may make the current code stale without erasing a prior verified result. The identity/boundaries for new challenge attempts must be explicit; old PR numbers and replay board moves must not silently become the new attempt model.

Proposed shell contract (names illustrative, not a new storage schema): `WorkingArea({ challenge, files, verification, onCheck, onCancel, onRetry, feedback, outcome, nextChallenge, shareControls })`. Next is available as the dominant action only after a matching verified verdict; the person may continue editing or inspect evidence. No automatic navigation that steals focus or discards code.

## Compatibility constraint requiring evidence-owner resolution

The current implementation cannot honestly encode this by changing labels alone:

- `RunPurpose` is `local | pull-request` (`packages/domain/workspace.ts`). `casesRun(..., local)` checks visible cases only.
- `WorkspaceSession.run(pull-request)` checks the full suite but also emits `observation.workspace.pull-request` and creates/pushes numbered PR state.
- Existing completion is a recorded board move whose trigger is `pull-request-merged`; evidence, results and replay boundaries depend on that meaning.

Do not call a hidden PR/merge pipeline and pretend it is a new challenge completion model. Do not expand local runs to the full suite while keeping the same capture version/meaning. Do not invent a completion event, rewrite old records, or add an unrecorded verification path to avoid the contract.

The user has prohibited new telemetry/collection changes. ENG-329 must propose how to retain the current collection boundary while representing full verification and completion truthfully, identifying any minimum versioned semantic change for dot to resolve before implementation. This proposal itself authorizes no new event, upload field, telemetry schema or legal change. Until resolved, current checks can retain their literal historical meaning, but they cannot be presented as the new completion model.

Preserve legacy `/pulls`, result cards, board records and stored artifacts as explicitly historical compatibility readers. Keep their old interpretation; remove them from the primary navigation/journey only when the replacement is ready. No deletion, migration or stats reset is required for the shell redesign.

## Implementation and verification sequence

1. Dot/evidence owner settle the execution/completion/attempt compatibility contract; publish concrete verdict props and ownership hunks here.
2. ENG-328 replaces the working-area composition and catalog presentation against that contract. ENG-329 supplies feedback/outcome; ENG-332 supplies optional share metadata/controls.
3. Test current code/revision matching, all-case failure/recovery, late-result ordering, editing after green, cancellation/retry, pause/resume, multi-file editing and keyboard focus. Verify legacy records and shared links stay readable and no PR/merge/Resolve action is required.
4. Provide new before/after screenshots and focused tests, typecheck and build. Stale workplace/PR screenshots are removed; old tests remain historical compatibility checks. Capture a real updated practice screenshot only after that UI exists. Dot reviews the integrated result; no child merge or deployment.

## Clarity refinement and reversible work

User message Sentinel_d0a5774bbc808191a3ec12beb190ff28 supersedes blanket realism requirements. Goal, examples and constraints must be understandable immediately; challenge difficulty belongs in solving, not interpreting the prompt. Preserve useful real-world framing without manufacturing it. Visible input/expected-output examples clarify requirements and are not implementation answers. No catalog expansion is needed.

Reversible presentation proceeds independently of the completion contract: the catalog says Explore and offers non-status grouping/filter controls; legacy status query URLs remain readable without redefining Done. Challenge detail and the working-area task view show Goal and requirements, published visible Examples with explicit Input/Expected output labels, and Notes and constraints, open by default because existing comments can contain requirements. They do not rewrite immutable challenge text, invent constraints, or change run/recording behavior. Old completion UI remains superseded pending the evidence-owner contract.

## Dot’s immediate decisions

Use challenge for a task, practice for its working area, explore for the catalog, and profile for evidence outside the work flow. Existing URLs remain compatible; labels do not imply a data migration. Realism is optional.

Public goals, constraints and visible examples remain explicit. Hidden expected outputs and solutions stay hidden. Hidden-check feedback exposes fixed failure categories and points to public requirements; no hidden inputs, case names, returned values, error messages, traces or printed test data appear in the practice feedback. Public example runs keep their detailed feedback. This supersedes the earlier all-expected-values presentation in ENG-329 `91f1521`.

No broad migration, new collection, capture purpose/version or completion persistence is approved. The precise capture proposal and full verification/completion gate remain pending; deterministic correctness and safety blockers must be included in that proposal, without manual Resolve.

Presentation checks: `LOOP_ORIGIN=http://localhost:3128 node --import tsx tools/browser/challenge-presentation-check.ts` verifies keyboard explore search/filtering, literal public input/output examples, removal of detail status/PR controls, legacy status URLs, editor focus/save/resume, and the mobile challenge view. Transcript regression tests use sentinel hidden values to check that every output channel stays redacted.

Stale workplace/PR screenshots are removed. There is no screenshot of the future lean practice UI yet; none is fabricated. Existing working-area chrome/completion is preserved and superseded, not presented as a finished lean-loop release.

Hidden-feedback integration pins ENG-329 `bf94f27`, including its sentinel surface tests and fixed category helpers. Practice consumes those helpers; dynamic error names are not a safe category. No completion writer, BoardMoveTrigger, capture version or ingest schema change is included. Other schema proposals remain proposals under this stream’s current direct instruction.
