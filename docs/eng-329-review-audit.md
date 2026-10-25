# ENG-329 review feedback and outcome audit

Baseline `1edfb853356f7ee8cb53d5fef8efe4a5e070bfc8`. This stream owns `pull-outcome.tsx`, the new `review.tsx` (Findings, Checks), `lib/brief.ts`, `lib/diagnosis.ts`, their tests and styles. `pulls.tsx` and `ide.tsx` are ENG-328's; the hunks they need are at the end. Evidence and event schemas are unchanged.

## Removed or shortened, and why

| Element                                                                                                                                                                                                                | Change                                                                                                                                   | Why                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Open PR: **Before merging** (OutcomeView open branch)                                                                                                                                                                  | Removed                                                                                                                                  | It restated the merge box's verdict and the Findings count. The merge box is the canonical blocker; Findings is the to-do list.                                                                                    |
| Findings CI block: "Only a push whose checks pass clears this."                                                                                                                                                        | Removed                                                                                                                                  | The merge box says every check has to pass.                                                                                                                                                                        |
| Findings CI block: bare case names                                                                                                                                                                                     | Now: case name, input, what the code did, and the expected value for cases in the test file only                                         | Diagnostic: says what failed and which requirement caught it.                                                                                                                                                      |
| CI-only cases' expected value (Findings, Checks tab)                                                                                                                                                                   | No longer shown; marked **CI only**                                                                                                      | It is the answer to a check the person was not given. Showing it let a later push fit it, which weakens what "checks you didn't see passed" means in the evidence. **Product decision for dot** (see Limitations). |
| Checks tab, CI didn't reach the tests                                                                                                                                                                                  | Unchanged: error and traceback                                                                                                           | It's the detail behind Findings, where the error is one line.                                                                                                                                                      |
| Resolved findings                                                                                                                                                                                                      | Folded under **N resolved findings**                                                                                                     | They're history and not actionable; open findings stay first.                                                                                                                                                      |
| "Resolved by you. CI still has to pass before merging; another failing push opens a new finding." / "Resolved by you. If the next push still does this, it opens again." / "Resolved by push N: it no longer applies." | Now in the badge: **Resolved by you**, **Resolved by push N**, **Resolved by your reply**. The reopening rule moves to Resolve's tooltip | The merge box covers CI; the badge carries the fact.                                                                                                                                                               |
| "On push N" line under each review                                                                                                                                                                                     | Moved into the card header                                                                                                               | One line fewer per finding.                                                                                                                                                                                        |
| Merged **Outcome**: legend paragraph, then seven sections (~15 lines)                                                                                                                                                  | First a headline and at most three lines; seven sections under **All evidence** (folded), with a one-line legend                         | Short outcome first, detail when wanted.                                                                                                                                                                           |

## What the brief keeps (lib/brief.ts)

- **First submission and later result:** "All 12 checks passed on push 3. On the first push, 7 of 12 checks passed." / "…The first push passed too." / one push: "All 12 checks passed on the first push."
- **Tested and pushed artifact:** the evidence's `before-push` line (tested-passing, tested-failing, changed-after, unknown), or "Didn't run the tests before pushing" when there were no runs.
- **Missing evidence:** "What CI said on the first push isn't known."; capture gaps or code not kept; CI-only checks not available. These are marked **Not known**.
- Every brief line is copied from `describe()`, so the brief can't say anything the full evidence doesn't (this is tested).
- Open, failing, stale and closed pull requests get no brief (tested). The merge gate's blocker stays the only place that says what is left.

## Contract for ENG-328

`app/(browse)/_components/review.tsx`:

```ts
export function Findings(props: {
  pull: PullSummary;
  outcome: Json | null; // detail.outcome
  cases?: readonly Case[]; // revision?.checks.cases
  threads: Thread[]; // feedback threads for this number
  revisions: Record<string, Revision>;
  onResolve?: (thread: Thread, via: BoardMoveVia) => Promise<void>; // open only
  onReply?: (thread: Thread, text: string) => Promise<void>;
}): JSX.Element | null; // same props as pulls.tsx's Findings today

export function Checks(props: {
  outcome: Json | null;
  cases?: readonly Case[];
}); // same as today

export function FailedChecks(props: { diagnosis: Diagnosis | null }); // optional reuse, e.g. a merge box
```

`lib/diagnosis.ts`: `diagnose(outcome, cases): Diagnosis | null`, a pure function with rows `{ name, input, visible, expected: {value} | null, passed, observed }`.

`PullOutcome`: props unchanged. `ideHref` is now optional and unused, so you can drop it.

### Hunk: pulls.tsx

```diff
-import { PullOutcome } from "./pull-outcome";
+import { PullOutcome } from "./pull-outcome";
+import { Checks, Findings } from "./review";
```

Then delete pulls.tsx's local `Outcome`, `show`, `Checks`, `Findings`, `CiFinding` and `ReviewThread` (baseline lines 959–974 and 976–1069, then 1156–1433). Drop imports that become unused (`runFeedback`, `Case`, `isCiFinding` if the MergeBox `explicit` check no longer uses it, `Markdown` if only ReviewThread used it). The call sites `<Findings … />` and `<Checks … />` need no change. Pass `onReply={pull.state === "open" ? reply : undefined}` to Findings if replies should work: at baseline `reply` is defined but not passed, so replying isn't reachable on the page. That is a bounded correctness fix, and your call.

### Hunk: ide.tsx (Tests → Case): don't reveal CI-only expected values on a pull request run in the IDE

```diff
           <Case
             key={index}
             index={index}
             label={check.name ?? caseLabel(challenge, check.input)}
-            expected={check.expected}
+            expected={check.visible ? check.expected : undefined}
             passed={feedback.passed[index]}
             result={o.cases[index]}
           />
```

```diff
-            <span>
-              expected <code>{JSON.stringify(expected)}</code>
-            </span>
+            {expected !== undefined ? (
+              <span>
+                expected <code>{JSON.stringify(expected)}</code>
+              </span>
+            ) : (
+              <span className="faint">CI only</span>
+            )}
```

(`expected: unknown` in Case's props becomes `expected?: unknown`.)

## Limitations

- Hiding CI-only expected values changes what players see, not what is recorded. It is a deliberate product call within this issue's "without leaking the intended answer". The cases still ship with the revision (docs/workspace.md), so this is presentation, not secrecy. If dot rejects it, revert the `expected: c.visible ? … : null` line in `lib/diagnosis.ts`, its tests, and the doc sentences.
- `actionsOf` / `Evidence.actions` in `lib/evidence.ts` is no longer rendered. It stays (tested, and possibly read by other streams); remove it after integration if nothing uses it.
- No component-render tests exist in this repo; the logic is covered by `lib/brief.test.ts` and `lib/diagnosis.test.ts`. Screenshots need the integrated pulls.tsx.
