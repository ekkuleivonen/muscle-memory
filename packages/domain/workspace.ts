/**
 * Raw observations from the issue workspace (the IDE): every key pressed in its editors, editor
 * transactions, selections, scrolling, focus, copy and cut, the help the editor showed, which
 * files and panels were open, whether the page was visible, the runtime, runs, pull requests
 * and teammate feedback. Disclosed and local-only. Keys are heard only inside the IDE's
 * editors; the clipboard is never read (a paste is recorded as the edit it makes).
 */
import { boundText, CAPTURE_LIMIT_BYTES, safeIdentifier } from "./capture";
import { canonical, type Json } from "./json";

/**
 * 6.0.0: `opened` carries the person's profile as it stood when the IDE opened (experience,
 * how often they code with AI, languages, goal, editor; whatever they answered, null before
 * any answers), so every attempt says who made it without a join.
 * 5.0.0: everything that happens in the IDE, as finely as it happens. Every observation has
 * `elapsedMs`, a monotonic clock from the start of its source stream, for exact intervals.
 * New: `keys` (every key down and up and IME composition in an editor, batched about once a
 * second), `selection` (cursor and selection moves that change no text, merged within 100 ms),
 * `scroll` (the lines in view, merged within 250 ms), `focus`, `clipboard` (copy and cut
 * ranges), `assist` (type errors shown and hover types opened), `navigated` (files opened,
 * shown and closed, the side bar and panel), `page` (visible, focused, size), `runtime` (the
 * runtime loading, ready or failing) and `closed`. Read-only files report keys, selection,
 * scrolling, focus and copies too. A run says how it was started (`via`), and `opened` says
 * where the IDE was opened from and the window size.
 * 4.0.0: teammate feedback. `comment` records a teammate comment released by its trigger,
 * `hint` a hint, and `thread-resolved` a blocking review thread that a later push no longer
 * triggers. The ticket's own thread (comments on the `opened` event) is part of the ticket and
 * is not recorded. A reply is recorded on the board (board capture 3.0.0). A local run (Run
 * tests) runs only the revision's visible cases, in order; a pull request's run runs every case.
 * 3.0.0: a workspace can have several editable files. Every edit names its `file`, and a code
 * revision artifact holds every editable file (`files`, each bounded on its own) instead of one
 * `text`; `revision` counts edits across all files.
 * 2.0.0: issues are no longer versioned Challenges. Every observation names the `issue` (its
 * permanent id) and the `issueRevision` it ran against (the SHA-256 of the revision's content),
 * instead of `challengeArtifactId`. A pull request stays open whatever its checks say until the
 * person merges it (a board move); work on an open one is pushed to it, recorded under the same
 * `number` with `push` 2, 3, …, and `result` reports only that run's checks. Earlier versions
 * were never released.
 */
export const WORKSPACE_CAPTURE_VERSION = "workspace-capture-6.0.0";
/** An edit whose change set is larger than this is recorded without it, plus a snapshot. */
export const EDIT_CHANGES_LIMIT_BYTES = 16384;
/** What this capture version does not record. Absence is a gap, not evidence of no activity. */
export const WORKSPACE_CAPTURE_GAPS = [
  "pointer-movement-and-hover-without-a-tooltip",
  "layout-resizing",
  "activity-in-other-tabs-and-apps",
  "writes-cut-short-by-closing-the-page",
] as const;

/** A key event in an editor: elapsedMs, kind, the key, modifiers held (C, A, S, M), repeat. */
export type KeyEvent = readonly [
  elapsedMs: number,
  kind: "down" | "up" | "compose-start" | "compose-end",
  key: string,
  modifiers: string,
  repeat: boolean,
];
export type ViewTarget = "file" | "side" | "panel";

export type RunStatus =
  | "queued"
  | "running"
  | "result"
  | "user-error"
  | "runner-error"
  | "timeout"
  | "cancelled";

export interface ObservationData {
  "observation.workspace.opened": {
    readonly revision: number;
    readonly codeArtifactId: string;
    /** The app page the IDE was opened from (same-origin path), or null. */
    readonly entry: string | null;
    /** The self-reported profile at this moment (onboarding or settings answers), or null. */
    readonly profile: Json | null;
    readonly viewport: { readonly width: number; readonly height: number } | null;
    readonly editor: {
      readonly name: string;
      readonly features: readonly string[];
    };
    readonly runtime: Json;
    readonly captureGaps: readonly string[];
  };
  "observation.workspace.edit": {
    /** The file edited: a path in the issue's workspace. */
    readonly file: string;
    readonly revision: number;
    /** CodeMirror ChangeSet JSON, or null when it exceeded the limit (see `snapshot`). */
    readonly changes: Json | null;
    readonly changesBytes: number;
    readonly changesTruncated: boolean;
    readonly userEvent: string | null;
    readonly selection: Json;
    readonly docLength: number;
  };
  "observation.workspace.snapshot": {
    readonly revision: number;
    readonly codeArtifactId: string;
    readonly reason:
      | "opened"
      | "periodic"
      | "run"
      | "oversize-edit"
      | "restored";
  };
  "observation.workspace.run": {
    readonly runId: string;
    /** How it was started: a button, or a keyboard shortcut. */
    readonly via?: "pointer" | "keyboard";
    /** Run tests (local), or the checks of a pull request. Absent before 1.2.0: local. */
    readonly purpose?: RunPurpose;
    readonly revision: number;
    readonly codeArtifactId: string;
    readonly status: RunStatus;
    readonly runtime: Json;
    readonly timeoutMs: number;
    /**
     * Raw, bounded runner outcome for terminal statuses. Its cases follow the revision's
     * visible cases for a local run, and all of them for a pull request.
     */
    readonly outcome?: Json;
  };
  /**
   * A pull request opened, or pushed to: the code at one revision, checked by one run.
   * Recorded once its checks finish; it stays open for the person to review and merge (a
   * board move to Done).
   */
  "observation.workspace.pull-request": {
    /** 1, 2, 3, … per person and issue, across sessions. */
    readonly number: number;
    /** 1 when opened, then 2, 3, … for each push to the open pull request. */
    readonly push: number;
    readonly runId: string;
    readonly revision: number;
    readonly codeArtifactId: string;
    readonly result: PullRequestResult;
    readonly passed: number;
    readonly total: number;
  };
  /**
   * A teammate comment released by its trigger. Its text is in the revision this observation
   * names; `wording` is which of its wordings was shown.
   */
  "observation.workspace.comment": {
    readonly comment: string;
    readonly where: "issue" | "review";
    readonly severity: "blocking" | "nit" | "info";
    readonly wording: number;
    /** For a review comment: the pull request and the push it reviewed. */
    readonly pullRequest?: number;
    readonly push?: number;
  };
  /** A hint released by its trigger, strictly in level order. */
  "observation.workspace.hint": {
    readonly hint: string;
    readonly level: number;
  };
  /** A blocking review thread resolved by a push that no longer triggers it. */
  "observation.workspace.thread-resolved": {
    readonly comment: string;
    readonly pullRequest: number;
    readonly push: number;
    readonly by: "code";
  };
  /** Key events in one file's editor, in order, about a second at a time. */
  "observation.workspace.keys": {
    readonly file: string;
    readonly keys: readonly KeyEvent[];
  };
  /** The cursor or selection moved without changing text; bursts merge within 100 ms. */
  "observation.workspace.selection": {
    readonly file: string;
    /** CodeMirror EditorSelection JSON after the last move. */
    readonly selection: Json;
    readonly userEvent: string | null;
    /** Moves merged into this one, itself included. */
    readonly moves: number;
  };
  /** The lines in view after scrolling; bursts merge within 250 ms. */
  "observation.workspace.scroll": {
    readonly file: string;
    readonly fromLine: number;
    readonly toLine: number;
  };
  "observation.workspace.focus": {
    readonly file: string;
    readonly focused: boolean;
  };
  /** Text copied or cut in an editor: where, never the clipboard. */
  "observation.workspace.clipboard": {
    readonly file: string;
    readonly kind: "copy" | "cut";
    readonly ranges: readonly { readonly from: number; readonly to: number }[];
    /** Nothing was selected, so the editor took the cursors' whole lines. */
    readonly wholeLines: boolean;
  };
  /** Help the editor showed: type errors after a pause in typing, or a hover type. */
  "observation.workspace.assist": {
    readonly file: string;
    readonly kind: "diagnostics" | "hover";
    readonly items: Json;
  };
  /** A file, side bar view or panel opened, shown or closed. */
  "observation.workspace.navigated": {
    readonly target: ViewTarget;
    readonly action: "open" | "show" | "close";
    readonly value: string;
    readonly via: "pointer" | "keyboard" | "app";
  };
  /** The page became visible or hidden, gained or lost focus, or was resized. */
  "observation.workspace.page": {
    readonly visible: boolean;
    readonly focused: boolean;
    readonly width: number;
    readonly height: number;
  };
  "observation.workspace.runtime": {
    readonly state: "loading" | "ready" | "unavailable";
    readonly message?: string;
  };
  /** The IDE was left: navigating away in the app, or the page being closed. */
  "observation.workspace.closed": {
    readonly reason: "left" | "page-hidden-for-unload";
  };
  "observation.workspace.capture-gap": {
    /** Inclusive source positions whose observations were not stored. */
    readonly fromSequence: number;
    readonly toSequence: number;
    readonly reason: "buffer-full" | "write-conflict";
  };
}
export type ObservationType = keyof ObservationData;
export type RunPurpose = "local" | "pull-request";
/** What a pull request's checks said. Failed: some case did not pass. Errored: the code never got to the cases. */
export type PullRequestResult =
  | "checks-passed"
  | "checks-failed"
  | "checks-errored"
  | "cancelled";

export interface WorkspaceObservation<
  T extends ObservationType = ObservationType,
> {
  readonly schemaVersion: "1.0.0";
  readonly type: T;
  readonly observationId: string;
  readonly participantId: string;
  readonly source: { readonly id: string; readonly sequence: number };
  readonly occurredAt: string;
  /** Milliseconds since the source stream started, on a monotonic clock (0.1 ms steps). */
  readonly elapsedMs: number;
  readonly serverReceipt: {
    readonly status: "absent";
    readonly reason: "local-only";
  };
  readonly captureVersion: string;
  readonly consentVersion: string;
  readonly researchConsent: false;
  /** The issue's permanent id. */
  readonly issue: string;
  /** The revision worked against: sha256:… of its content. */
  readonly issueRevision: string;
  readonly data: ObservationData[T];
}

/** One file's text in a code revision, bounded on its own. */
export interface CodeFile {
  /** text/x-python, text/x-go, text/html, ...; always UTF-8. */
  readonly mediaType: string;
  readonly text: string;
  readonly capture: {
    readonly limitBytes: number;
    readonly originalBytes: number;
    readonly capturedBytes: number;
    readonly truncated: boolean;
  };
}

/** Every editable file at one revision of the workspace. */
export interface CodeRevisionArtifact {
  readonly schemaVersion: "2.0.0";
  readonly type: "artifact.code-revision";
  readonly artifactId: string;
  readonly owner: "participant";
  readonly participantId: string;
  readonly revision: number;
  readonly captureVersion: string;
  readonly files: Readonly<Record<string, CodeFile>>;
  /** True when any file was cut at the limit: then this copy cannot restore the code. */
  readonly truncated: boolean;
}

/** What a store keeps: one canonical payload per stable ID. */
export interface WorkspaceRecord {
  readonly recordId: string;
  readonly kind: "observation" | "artifact";
  readonly participantId: string;
  readonly payload: string;
}

export function codeRevision(
  participantId: string,
  sourceId: string,
  revision: number,
  files: Readonly<Record<string, { text: string; mediaType: string }>>,
): CodeRevisionArtifact {
  const artifactId = `${sourceId}.code.${revision}`;
  safeIdentifier(artifactId);
  const bounded = Object.fromEntries(
    Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, { text, mediaType }]): [string, CodeFile] => {
        const cut = boundText(text);
        return [
          path,
          {
            mediaType,
            text: cut.text,
            capture: {
              limitBytes: CAPTURE_LIMIT_BYTES,
              originalBytes: cut.originalBytes,
              capturedBytes: cut.capturedBytes,
              truncated: cut.truncated,
            },
          },
        ];
      }),
  );
  return {
    schemaVersion: "2.0.0",
    type: "artifact.code-revision",
    artifactId,
    owner: "participant",
    participantId,
    revision,
    captureVersion: WORKSPACE_CAPTURE_VERSION,
    files: bounded,
    truncated: Object.values(bounded).some((f) => f.capture.truncated),
  };
}

export function toRecord(
  value: WorkspaceObservation | CodeRevisionArtifact,
): WorkspaceRecord {
  const payload = canonical(value as unknown as Json);
  return "observationId" in value
    ? {
        recordId: value.observationId,
        kind: "observation",
        participantId: value.participantId,
        payload,
      }
    : {
        recordId: value.artifactId,
        kind: "artifact",
        participantId: value.participantId,
        payload,
      };
}

/**
 * Which cases a stored run outcome passed: each output must equal its case's expected value as
 * canonical JSON. Recomputed on demand; it never replaces the raw outcome.
 */
export function runFeedback(
  checks: readonly { readonly expected: Json }[],
  cases: readonly { output?: { text: string; truncated: boolean } }[],
): { passed: boolean[]; correct: number; total: number; unscorable: number[] } {
  const unscorable: number[] = [];
  const outputs = checks.map((_, index): Json => {
    const output = cases[index]?.output;
    if (!output || output.truncated) {
      unscorable.push(index);
      return null;
    }
    try {
      return JSON.parse(output.text);
    } catch {
      unscorable.push(index);
      return null;
    }
  });
  const passed = checks.map(
    (check, index) =>
      !unscorable.includes(index) &&
      canonical(outputs[index]) === canonical(check.expected),
  );
  return {
    passed,
    correct: passed.filter(Boolean).length,
    total: passed.length,
    unscorable,
  };
}

/**
 * A pull request's checks result from its run outcome. Passed needs a completed test phase in
 * which every case passed; a compile or runtime error, timeout or runner failure means the checks
 * errored before reaching the cases.
 */
export function pullRequestResult(
  checks: readonly { readonly expected: Json }[],
  outcome:
    | {
        status: string;
        phase?: string;
        cases?: readonly { output?: { text: string; truncated: boolean } }[];
      }
    | undefined,
): { result: PullRequestResult; passed: number; total: number } {
  const total = checks.length;
  if (!outcome || outcome.status === "cancelled")
    return { result: "cancelled", passed: 0, total };
  if (
    (outcome.status !== "completed" && outcome.status !== "user-error") ||
    outcome.phase !== "tests" ||
    !outcome.cases
  )
    return { result: "checks-errored", passed: 0, total };
  const { correct } = runFeedback(checks, outcome.cases);
  return {
    result: correct === total && total > 0 ? "checks-passed" : "checks-failed",
    passed: correct,
    total,
  };
}
