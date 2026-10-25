# ENG-329 proposed schema delta: Check code and automatic completion

**Status: superseded, kept for its path inventory only.** Dot decided on 2026-10-25: an additive `checks-passed` `BoardMoveTrigger` with board capture 7.1.0 → 7.2.0; `via` stays the original Submit gesture, documented as its cause, with no "automatic" value; internal submission records are kept for now, with no new `RunPurpose`. ENG-328 owns the completion writer and the schema and ingest changes. ENG-329 owns only the components and diagnosis. The lists of writers, validators, ingest and readers below (in particular, artifacts checked against exactly one workspace version at `packages/domain/ingest.ts:110`, and the merge recording the live revision rather than the checked one) may still help ENG-328.

## Why something has to change

ENG-328 is right that the current values are semantic boundaries:

- `RunPurpose = "local" | "pull-request"` (`packages/domain/workspace.ts:235`). `local` runs only the visible cases. `pull-request` runs every case _and_ emits `observation.workspace.pull-request` (number, push), which says a pull request was opened or pushed to. Check code is neither, so reusing either value would change what the record means.
- `board.moved` with `to: "done"` is valid only with `trigger: "pull-request-merged"`, `pullRequest` and `runId` (`packages/domain/board.ts:263`: "Only a merged pull request moves an issue to Done."). `via` is `"pointer" | "keyboard"`, meaning the input that made the move. Automatic completion has no input of its own.

## Proposed delta

### Workspace capture: 6.0.0 → 7.0.0

```diff
-export type RunPurpose = "local" | "pull-request";
+/** local: Run tests, the visible cases. pull-request: a pull request's checks (6.x only).
+ *  check: Check code, every published case on the saved code; no pull request. */
+export type RunPurpose = "local" | "pull-request" | "check";
```

- **What a Check code run records:** `observation.workspace.run` with `purpose: "check"`, the same fields as today (`runId`, `via` = the Check code input, `revision`, `codeArtifactId`, `status`, `outcome` over every case, as for `pull-request`). It emits **no** `observation.workspace.pull-request`.
- **Why major:** a new value of an existing field, which 6.x readers don't know.
- **Version comment:** "7.0.0: Check code. A run with `purpose: "check"` runs every published case on the saved code; there are no pull requests. 6.x `pull-request` runs and `observation.workspace.pull-request` records keep their meaning."

Example:

```json
{
  "type": "observation.workspace.run",
  "captureVersion": "workspace-capture-7.0.0",
  "issue": "frequency-map",
  "issueRevision": "<sha256>",
  "data": {
    "runId": "r-9",
    "via": "keyboard",
    "purpose": "check",
    "revision": 41,
    "codeArtifactId": "a-41",
    "status": "result",
    "runtime": {},
    "timeoutMs": 10000,
    "outcome": { "phase": "tests", "cases": [] }
  }
}
```

### Board capture: 7.1.0 → 8.0.0

```diff
-export type BoardMoveVia = "pointer" | "keyboard";
+export type BoardMoveVia = "pointer" | "keyboard";
+/** A move with no input of its own: Done when a check passed. The input is the run's `via`. */
+export type BoardMoveViaOrAutomatic = BoardMoveVia | "automatic";
 export type BoardMoveTrigger =
   | "status-menu"
   | "start-work"
   | "pull-request-merged"
-  | "replay";
+  | "replay"
+  | "check-passed";

 export interface BoardMoveData {
-  readonly via: BoardMoveVia;
+  readonly via: BoardMoveViaOrAutomatic;
   readonly trigger: BoardMoveTrigger;
-  /** For pull-request-merged: the pull request, and the workspace run that checked it. */
+  /** pull-request-merged: the pull request and the run that checked it.
+   *  check-passed: the Check code run that passed (no pull request). */
   readonly pullRequest?: number;
   readonly runId?: string;
 }
```

**Validator** (`boardMove`, board.ts:233), replacing the "only merged" rule:

- `to === "done"` ⇔ the trigger is `pull-request-merged` or `check-passed`.
- `pull-request-merged`: `via` is pointer or keyboard, and it has `pullRequest ≥ 1` and `runId` (unchanged).
- `check-passed`: `via === "automatic"`, `runId` is required, `pullRequest` is absent.
- `via === "automatic"` ⇔ `check-passed`.
- `VIAS` for `boardClose` and `boardResolve` stays `pointer | keyboard`. `"automatic"` is valid only on a move.

**`observation.board.result`** (`boardResult`, board.ts:485): exactly one of `pullRequest` (6.x/7.x) or `runId` (8.0.0, the check that completed it). Today `pullRequest` is required. `tools/aggregates/aggregate.py` reads only `issueKey`, `language`, `metrics` and `values`, so it is unaffected.

**Why major:** Done no longer comes only from a merge, and a new `via` value exists.

Example:

```json
{
  "type": "observation.board.moved",
  "captureVersion": "board-capture-8.0.0",
  "issue": "frequency-map",
  "issueRevision": "<sha256 of the checked revision>",
  "data": {
    "issueKey": "FN-3",
    "from": "in-progress",
    "to": "done",
    "via": "automatic",
    "trigger": "check-passed",
    "onBoardBefore": 1,
    "nudged": false,
    "runId": "r-9"
  }
}
```

### Keeping `via` truthful for asynchronous completion

The person's input is recorded once, where it happened: the Check code run's `via` (`observation.workspace.run`, joined by `runId`). The completion is recorded as what it is, `"automatic"`. It is written by the session that recorded the run's terminal result, right after that result, so `occurredAt` is when the verdict became known, not when the button was pressed.

If the page closes between the result and the write, the next session that opens the challenge writes it when the verdict reads `passed` for that run and no completion names that `runId`. It is idempotent, one completion per `runId`. `onBoardBefore` and `nudged: false` are read from the stored board at write time, as `complete()` does today.

### Ingest: `packages/domain/ingest.ts`

```diff
 export const ACCEPTED_CAPTURE = [
   WORKSPACE_CAPTURE_VERSION,          // workspace-capture-7.0.0
+  "workspace-capture-6.0.0",          // queued records from before Check code
   BOARD_CAPTURE_VERSION,              // board-capture-8.0.0
+  "board-capture-7.1.0",
   "board-capture-7.0.0",
   "board-capture-6.1.0",
   "board-capture-6.0.0",
 ] as const;
```

Artifacts are currently checked against exactly `WORKSPACE_CAPTURE_VERSION` (ingest.ts:110). That check must accept `workspace-capture-6.0.0` too, or code artifacts still queued from 6.0.0 are refused. Workspace has never had a second accepted version, so this path is new. The server never re-validates payload shapes, so new enum values need no server change beyond the version list.

## Current versus pinned revision

The rule is unchanged from `mergeEligibility` (`apps/web/lib/merge.ts`). A check counts only if its `issueRevision` is published and is the revision the practice area last opened on in this attempt (the last `observation.workspace.opened`).

- **Pinned earlier revision:** an attempt opened on a pinned earlier revision that is still published keeps its own checks; the live revision is never swapped in.
- **Reopened on a newer revision:** the earlier check reads `stale: revision`.
- **What the completion names:** the board envelope's `issueRevision` is the **checked** revision. Today the merge writes `issue.revision ?? shipped.issueRevision` (pulls.tsx), which names the live revision even when the checks ran on a pinned one. That is a bounded correctness fix to make in the same change.

## Verdict: lib/verdict.ts (pure, read-only, ENG-329)

```ts
type Verdict =
  | { state: "unchecked" }
  | { state: "running"; check: number }
  | { state: "failing"; check: number; diagnosis: Diagnosis }
  | {
      state: "stale";
      check: number;
      reason: "code-changed" | "code-unconfirmed" | "revision";
    }
  | { state: "blocked"; check: number; required: Thread[] } // checks pass, a required rule fires
  | { state: "passed"; check: number; runId: string; first: boolean }
  | {
      state: "completed";
      at: string;
      via: "check-passed" | "pull-request-merged";
    };
```

**Which check counts:**

- The latest check is the last `purpose: "check"` run started in the attempt, by source order. A late result from an older run never stands for it.
- A newer run with no result is `running`.
- The code must match exactly: the same artifact id, or identical complete files. A truncated artifact gives `stale: code-unconfirmed`.
- Capture gaps don't block completion; they show as missing evidence.

**Required versus advisory rules (dot: deterministic correctness and safety block):**

- Teammate comments with `severity: "blocking"` that the checked code still triggers are required, and they clear only when the code no longer triggers them.
- `nit` and `info` comments are advisory.
- `resolve: "explicit"` and `ciFindings: "explicit"` (in existing revisions) are read as legacy: there is no Resolve, so they never gate. The revisions themselves are not edited.

**Historical records:**

- 6.x merges read as `completed` with `via: "pull-request-merged"`.
- 6.x pull requests stay pull requests in evidence and on the old `/pulls/...` links.

## Who changes what

| Path                                                                                                | Change                                                                                        | Owner                                  |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------- |
| `packages/domain/workspace.ts`                                                                      | `RunPurpose` + `"check"`, version 7.0.0 and comment                                           | ENG-329                                |
| `packages/domain/board.ts`                                                                          | trigger, `via`, validator, `boardResult` one-of, version 8.0.0 and comment                    | ENG-329                                |
| `packages/domain/ingest.ts`                                                                         | `ACCEPTED_CAPTURE`, artifact version check                                                    | ENG-329                                |
| `apps/web/app/workspace/session.ts`                                                                 | `check(via)` → `run("check", via)`, no pull-request record; terminal-result hook              | ENG-329 hunk, ENG-328 wires the button |
| `apps/web/app/(browse)/_components/board.tsx`                                                       | `completeByCheck(issue, runId)` writer (automatic, idempotent per runId)                      | ENG-329 hunk                           |
| `apps/web/app/(browse)/_components/board-log.ts`                                                    | `logResult` with `runId`                                                                      | ENG-329 hunk                           |
| `apps/web/lib/verdict.ts` (new), `lib/evidence.ts` (reads check runs as submissions; 6.x unchanged) | readers                                                                                       | ENG-329                                |
| `apps/web/lib/pulls.ts`, `lib/attempts.ts`                                                          | unchanged; they read 6.x literally (`check-passed` is not a merge, and replays are unchanged) | —                                      |
| Practice route, Check code button, Next, catalog done state                                         | consume `Verdict` and `useBoard`                                                              | ENG-328                                |
| `docs/telemetry.md`, `docs/board-activity.md`, `docs/workspace.md`                                  | document both versions                                                                        | ENG-329                                |
| `tools/aggregates`                                                                                  | no change; test that a result with `runId` aggregates                                         | ENG-329                                |

## Targeted tests

- **board.test.ts:**
  - `check-passed` is accepted only with `via: "automatic"` and a `runId`, and without `pullRequest`.
  - `automatic` is rejected on every other trigger, and on close and resolve.
  - A 7.1.0-shaped merge is still accepted.
  - `boardResult` accepts exactly one of `pullRequest` and `runId`.
- **ingest:** 6.0.0 workspace observations and artifacts, and 7.1.0 board records, are accepted; unknown versions are still refused.
- **verdict.test.ts:**
  - Lifecycle: unchecked, running, failing, code-changed, code-unconfirmed, revision changed, pinned revision still valid.
  - Ordering: a late result from an older run doesn't count.
  - Rules: a required rule blocks, an advisory one doesn't, and an explicit-resolve comment doesn't gate.
  - Completion: passed, completed by `check-passed`, completed by a 6.x merge.
- **evidence.test.ts:** check runs give first-versus-later; 6.x fixtures give identical output.
- **session.test.ts:** a check records `purpose: "check"` and no pull-request observation; the completion is written once per `runId`, and again on reopen if it was missed.
- **test_aggregate.py:** a result with `runId` and no `pullRequest` aggregates.

## Alternative, with no board change

Derive completion on read and write no board move and no result. Then the capture changes only on the workspace side, but completed challenges stop feeding the aggregates. That is a loss of existing collection rather than new collection.
