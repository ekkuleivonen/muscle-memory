# ENG-328 verification — one-file practice

Implementation commit: `e0eec49`. Explicit ENG-329 dependency: `986772d` (audited normalization and bounded content-alignment fixes). Main remains the authorized baseline `1edfb853356f7ee8cb53d5fef8efe4a5e070bfc8`; the sibling changes are intentionally integrated as a stack dependency, not unrelated main changes. This stream adds no seed content, model migration or catalog expansion.

The [active contract](eng-328-lean-contract.md) now supersedes the earlier multi-file UI: one editable entry, self-contained description/examples/requirements, internal harness/tests/support sources, no explorer/tabs/file selector, no hints or comment thread. SQL keeps its public schema. Explore remains searchable/filterable; Profile is factual evidence outside practice.

## Results

Heavy checks run serially with `flock /tmp/muscle-memory-heavy-check.lock <command>`.

- `npm test`: **247 passed, 0 failed**. Includes the shell contract across every live catalog entry; hidden expected-output/solution sentinels across composed feedback; exact code/revision/full-suite eligibility; genuine required-rule recovery independent of Resolve; stale/pending/malformed outcomes; atomic completion/outbox rollback/concurrency; real old/new constructor/ingest fixtures and literal historical readers; historical hint counts scoped to the original attempt and completion time.
- `npm run typecheck`: web and ingest pass.
- `npm run build` under Node 22: passes, including content/runtime integrity checks.
- `LOOP_ORIGIN=http://localhost:3131 node --import tsx tools/browser/practice-check.ts`: **passes against the production build**. Actual sandbox execution for JavaScript, Python, TypeScript and SQL, plus the keyboard and recovery paths below.
- `LOOP_ORIGIN=http://localhost:3132 node --import tsx tools/browser/challenge-presentation-check.ts`: **passes against the latest production build**. Explore keyboard search/filter, SQL catalog results, legacy status URLs, exact public examples, no comment thread/status/PR controls, focus/save/resume and mobile layout. Real IndexedDB old 7.1/new 7.2 fixtures show a historical hint count only on its original completion; no hint text or zero-help claim appears, and the stored hint payload is unchanged.

The all-catalog shell test is **structural**, not a blanket language/runtime validation claim. ENG-329's separate normalization deliverable reports its 46-challenge browser publish check at `986772d`; this stream runs the four representative language paths above. Runner/worker implementations are unchanged.

## Keyboard and recovery paths

1. Enter on Start in JavaScript → one source editor already focused. Failed runtime download leaves editing available; Tab/Enter Retry checks recovers the sandbox.
2. Ctrl/Cmd+Enter Submit on starter → failed public cases show input/expected/actual; hidden cases show only generic labels/fixed categories. Full-run Output withholds hidden-case streams and user-written error details. No completion is emitted.
3. Submit an endless loop → Cancel check → edit → Run examples. Public-only green cannot complete. Escape then Tab leaves the editor.
4. Correct code → Ctrl/Cmd+Enter → full-suite and required-rule verification → one atomic completion/result, `via: keyboard`, board capture 7.2.0 and unchanged workspace capture 6.0.0. Focus stays in code; Next challenge is the only primary continuation.
5. Edit after green → Next/current verification disappear immediately. Save/reload retains code and immutable previous completion without a duplicate result.
6. Python with correct case outputs but a required debug-print violation → requirement blocks completion. Remove it and Submit → completion without Resolve. The normalized TypeScript receipt challenge and SQL query also complete through their single entry.
7. Unsupported historical multi-file revision → compatibility notice, no editor and no new workspace opening. It is not made solvable by hiding a required file.
8. Synthetic saved multi-file work → current version pauses before workspace records are appended. Explicit saved-entry-only choice restores that code; explicit current-starter choice uses the normalized starter. Original entry/helper artifacts remain byte-for-byte unchanged in both paths. Reload preserves the chosen entry.
9. Keyboard activation of Next challenge uses client navigation and creates a fresh correctly named/revisioned workspace session, rather than reusing the old challenge's recorder.
10. Mobile displays the description/examples, public SQL schema and editor directly, with no dialog or horizontal page overflow.

## Real screenshots

Captured from the production build at `http://localhost:3131`, with synthetic attempts. Before/after means **before Submit** and **after recorded completion** on the new UI. Superseded multi-file/comment screenshots were replaced; no mock UI or human validation is claimed.

- [Before Submit](eng-328-evidence/practice-before-submit.png)
- [Failure](eng-328-evidence/practice-failure.png)
- [Recorded completion](eng-328-evidence/practice-after-completion.png)
- [Mobile SQL challenge](eng-328-evidence/practice-mobile.png)
- [Explicit historical recovery](eng-328-evidence/practice-version-recovery.png)

Reproduce with `PRACTICE_SCREENSHOTS=docs/eng-328-evidence LOOP_ORIGIN=http://localhost:3131 node --import tsx tools/browser/practice-check.ts` under the same lock.

## Collection and limitations

Internal full-suite `purpose: pull-request`, public-only `local`, workspace capture 6.0.0 and approved board 7.2 `checks-passed` semantics are unchanged. No new event fields/categories, identity, consent/legal, export/reset or broad persistence changes. No invisible hint/comment releases. Recovery appends the chosen actual opening/snapshot to the existing attempt; it fabricates neither a new attempt nor an automatic gesture.

Earlier published bundles, helper edits, recorded hint use and result/submission artifacts stay intact. The new shell deliberately cannot resume an unsupported old multi-file/hint-dependent workspace; historical records remain readable, and a player must explicitly choose how to move retained code into the current one-file version.

Profile displays positive historical built-in hint counts by reusing the existing evidence metric on each completion's original attempt and timestamp. Later hints and replay attempts do not alter earlier rows. Unit fixtures cover unrelated issues, later hints, replay isolation, text exclusion and unchanged input records; the production browser test also checks the mobile profile and original stored payload. No hint contents, collection or evidence semantics change.

Draft PR #40 remains for dot's integrated review/release. ENG-332 owns the remaining solution-outcome share integration; only its secondary challenge-link wording is composed here. Ingest accepting board 7.2 must precede the app in the combined release. No merge or deployment was performed.
