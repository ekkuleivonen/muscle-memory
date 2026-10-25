# ENG-328 verification

Implementation: lean Practice, searchable/filterable Explore and factual Profile. The [approved contract](eng-328-lean-contract.md) replaces the earlier pending proposal: current code/pinned revision, full suite and deterministic correctness/safety rules gate the additive `checks-passed` completion. Hidden expected outputs and all user-written hidden-error/output channels remain private. No manual Resolve or merge step.

Correcting hidden-output commit: `d3f85fb`. Completion writer/schema: `b1cb41b`; lean composition: `400394e`; current recorded-run matching/public requirements: `17240c5`. The explicit ENG-329 dependency is `df06ebf`, including its later run-level safeguards. Main still matches `1edfb853356f7ee8cb53d5fef8efe4a5e070bfc8`. The later ENG-329 normalized catalog is not silently included; its current and earlier published revisions can be composed separately by dot. ENG-332's secondary challenge-link wording hunk is consumed; new outcome-card serialization remains with that stream.

## Automated results

Run heavy suites serially with `flock /tmp/muscle-memory-heavy-check.lock <command>`.

- `npm test`: **241 passed, 0 failed**. Includes real constructor/ingest HTTP handling of old/new fixtures, exact-code/revision/full-outcome gate tests, required-rule recovery independent of old Resolve, same-millisecond pending runs, transaction rollback/concurrent completion/outbox, and sentinel rendering across hidden error/output surfaces.
- `npm run typecheck`: web and ingest pass.
- `python3 -m unittest discover -s tools/aggregates`: **2 passed**; old/new metrics-2 fixtures coexist, the checked move itself is not a metric, first-finish deduplication remains unchanged.
- `npm run build` under Node 22: passes; pinned runtime/content checks included. Runner/worker code and challenge content were not modified by this stream; a full content publish check is not claimed here.
- Remote CI for `17240c5`: web and erasure checks passed. Final documentation/screenshots commit is separately identifiable in the PR.
- `LOOP_ORIGIN=http://localhost:3130 node --import tsx tools/browser/practice-check.ts`: **passes** against the production build.
- `LOOP_ORIGIN=http://localhost:3130 node --import tsx tools/browser/challenge-presentation-check.ts`: **passes** against the production build.

## Representative keyboard paths

1. Enter on Start in JavaScript → source already focused. A failed runtime download leaves editing available; Tab/Enter on Retry checks recovers the sandbox.
2. Ctrl/Cmd+Enter Submit on starter → failed public examples show input/expected/actual; hidden cases show only generic labels/fixed categories. Output withholds streams for a full run containing hidden checks. No completion record is emitted.
3. Submit an endless loop → Tab/Enter Cancel check → cancelled feedback → edit → Run examples. Public-only green does not complete. Escape then Tab leaves the editor.
4. Correct code → Ctrl/Cmd+Enter Submit → exact full-suite verification → one atomic recorded completion/result with `via: keyboard`, 7.2 board capture and unchanged 6.0 workspace capture. Focus stays in code; Next challenge becomes the only primary action.
5. Edit after green → current verification/Next is withdrawn immediately; save and reload retain code and the immutable previous completion without appending another result.
6. Correct case outputs plus a required debug-print violation → all cases pass but the public requirement blocks completion. Remove the violation and Submit → completion without Resolve.
7. Existing multi-file revision → select another editable source, edit, switch, save and reload → same file/code restored. SQL keeps its public schema. Mobile shows requirements/examples/code directly without a dialog or horizontal page overflow.

## Screenshots

Only real screenshots of this implementation are supplied. Before/after means the new practice surface **before Submit** and **after recorded completion**, not a claim that removed workplace screenshots describe the current UI. Historical screenshots were removed; earlier work remains in Git history.

Captured against the production build at `http://localhost:3130`, using synthetic attempts:

- [Before Submit](eng-328-evidence/practice-before-submit.png)
- [Failure](eng-328-evidence/practice-failure.png)
- [After recorded completion](eng-328-evidence/practice-after-completion.png)
- [Mobile challenge](eng-328-evidence/practice-mobile.png)

Reproduce with `PRACTICE_SCREENSHOTS=docs/eng-328-evidence LOOP_ORIGIN=http://localhost:3130 node --import tsx tools/browser/practice-check.ts` under the same lock. No mock UI, fabricated data, human validation or deployment is claimed.

## Integration and remaining work

Draft PR #40 is stacked on ENG-329 #38. Dot owns normalized-catalog composition, review of all streams, selected share artifacts/outcome-card integration and one combined release. The app must not ship before ingest accepts board capture 7.2. Old records, old result cards and replay boundaries remain intact; legacy submission URLs are read-only. No merge or deployment was performed.

## Final ownership clarification regression

No collected-event meaning or runtime behavior changed. Internal full-suite `pull-request`, visible-only `local`, workspace capture 6.0.0 and the approved board 7.2 checked-completion contract remain as documented. No writer/reader competition or catalog edits.

Added `apps/web/app/work/feedback-boundary.test.ts`: real shared components plus the shell Output projection, visible examples and historical outcome reader/rendering. Nested hidden expected outputs/solution text remain absent for passing and failing hidden checks; detailed public expected/actual feedback stays present. The focused six-file regression run passes **38 tests**. The full suite passes **241 tests**, and web/ingest typechecks pass. This clarification changes tests/docs only; the previously recorded production build/browser results still apply to the unchanged application code.
