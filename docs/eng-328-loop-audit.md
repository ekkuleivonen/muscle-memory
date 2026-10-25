# ENG-328 working-loop inventory

Published before implementation, 2026-10-25. Baseline: `1edfb853356f7ee8cb53d5fef8efe4a5e070bfc8`; remote main matched at audit time. This stream owns route composition, not evidence, capture, consent or share serialization.

## Keep

- Ticket beside editable source, acceptance tests, file tabs and editor focus/selection continuity. No tutorial or setup step.
- Run tests and open/push PR shortcuts, cancellation, environment retry, save/recovery and offline messages.
- One current merge-eligibility gate, re-read on merge. Explicit Resolve remains deliberate and never substitutes for passing CI.
- Full checks, diff, timeline and evidence available for inspection. Optional sharing retains code opt-in.

## Change

- Arrival: replace the empty test panel's generic workflow explanation with a concrete entry-file instruction. Source is already open; the ticket remains beside it.
- Editing: Run tests dominates initially, after failures and after edits. A current passing local run promotes open/push PR. A current eligible PR promotes review; passing CI with outstanding review promotes the PR's findings. Neither shortcut becomes a gate.
- Review: put the merge/recovery control before the detailed history. Failed/stale checks lead back to editing; review-only blockers lead to Findings; eligible code leads to Merge. Keep Close secondary.
- Completion: one outcome, then one continuation action. Place optional share controls alongside continuation as secondary controls; retain detailed evidence and alternate destinations below.
- Integrate ENG-329 diagnostic/outcome components and ENG-332 share controls via their existing props or narrow supplied integration hunks, preserving single ownership of ide.tsx/pulls.tsx.

## Remove/consolidate

- Repeated primary Review and merge button in the IDE pull-request panel; header owns that action.
- Repeated merged/Done explanation in Next problem and the bottom merge box; the state badge and outcome already establish completion.
- Duplicate open-PR guidance from the outcome when the merge/recovery box already owns the next step (retain findings and complete evidence).
- Competing always-primary Open pull request before the first test; it remains accessible as secondary and by shortcut.

## Verification to deliver

Before/after arrival, failure/review and completion screenshots; keyboard paths for green, failed CI, Resolve, cancellation/retry and pause/resume; regression tests, typecheck and production build. Sibling components remain integration dependencies until their contracts and commits are available. No merge or deployment is authorized.

## Implemented integration

ENG-329 PR #38 (`ca34b8c`, then keyboard-heading fix `12567c9`) is an explicit stack dependency, not a subsequent main change. `pulls.tsx` consumes its `Findings`, `Checks` and unchanged `PullOutcome` props; the duplicated local review components are removed. Replies are now passed through to Findings. The IDE follows its CI-only expected-value presentation. That presentation remains a product decision for dot as noted in the sibling audit.

Completion includes the current unlisted issue in the next-problem lookup, so QUICK can suggest a listed next issue without adding QUICK to the catalog lists. Restored PR checks invalidate their visual Review promotion on the first edit only; no capture or evidence schema changed.

ENG-332 has no active thread/delivered contract in this T3 project at implementation time. Existing `ShareResult` and `CopyIssueLink` controls are composed as secondary actions in `NextPractice` through a `share: ReactNode` slot. Its artifact/metadata changes can land independently; dot still needs to compose and verify that stream in the integrated release.
