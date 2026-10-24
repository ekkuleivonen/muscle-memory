/**
 * Raw observations from the Challenge workspace (the IDE): editor transactions, recovery
 * snapshots and run lifecycle. Disclosed, local-only and scoped to the editor; nothing here
 * listens to the keyboard, clipboard or anything outside the workspace.
 */
import {
  canonical,
  fixtureVerdicts,
  type Challenge,
  type Json,
} from "./assessment";
import { boundText, CAPTURE_LIMIT_BYTES } from "./evidence";
import { safeIdentifier } from "./events";

/**
 * 1.2.0: runs say whether they were local or a pull request's checks, and each pull request
 * is recorded with its result. 1.1.0: code revisions in any language (the media type follows the file), the editor's
 * keymap among its features, and a null runtime for languages that cannot run yet.
 * 1.0.0 was Python only. Stored records keep theirs.
 */
export const WORKSPACE_CAPTURE_VERSION = "workspace-capture-1.2.0";
export const PYTHON_MEDIA_TYPE = "text/x-python; charset=utf-8";
/** An edit whose change set is larger than this is recorded without it, plus a snapshot. */
export const EDIT_CHANGES_LIMIT_BYTES = 16384;
/** What this capture version does not record. Absence is a gap, not evidence of no activity. */
export const WORKSPACE_CAPTURE_GAPS = [
  "selection-only-changes",
  "focus-and-scroll",
  "activity-outside-the-editor",
  "keystroke-timing-within-a-transaction",
  "active-time",
] as const;

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
    readonly editor: {
      readonly name: string;
      readonly features: readonly string[];
    };
    readonly runtime: Json;
    readonly captureGaps: readonly string[];
  };
  "observation.workspace.edit": {
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
    /** Run tests (local), or the checks of a pull request. Absent before 1.2.0: local. */
    readonly purpose?: RunPurpose;
    readonly revision: number;
    readonly codeArtifactId: string;
    readonly status: RunStatus;
    readonly runtime: Json;
    readonly timeoutMs: number;
    /** Raw, bounded runner outcome for terminal statuses. */
    readonly outcome?: Json;
  };
  /**
   * A pull request: the code at one revision, checked by one run. Recorded once its checks
   * finish. Merged means every check passed, which is what moves the issue to Done.
   */
  "observation.workspace.pull-request": {
    /** 1, 2, 3, … per person and Challenge, across sessions. */
    readonly number: number;
    readonly runId: string;
    readonly revision: number;
    readonly codeArtifactId: string;
    readonly result: PullRequestResult;
    readonly passed: number;
    readonly total: number;
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
/** Checks failed: some case did not pass. Errored: the code never got to the cases. */
export type PullRequestResult =
  | "merged"
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
  readonly serverReceipt: {
    readonly status: "absent";
    readonly reason: "local-only";
  };
  readonly captureVersion: string;
  readonly consentVersion: string;
  readonly researchConsent: false;
  readonly challengeArtifactId: string;
  readonly data: ObservationData[T];
}

export interface CodeRevisionArtifact {
  readonly schemaVersion: "1.0.0";
  readonly type: "artifact.code-revision";
  readonly artifactId: string;
  readonly owner: "participant";
  readonly participantId: string;
  readonly revision: number;
  /** text/x-python, text/x-go, text/html, ...; always UTF-8. */
  readonly mediaType: string;
  readonly text: string;
  readonly capture: {
    readonly captureVersion: string;
    readonly limitBytes: number;
    readonly originalBytes: number;
    readonly capturedBytes: number;
    readonly truncated: boolean;
  };
}

/** What a store keeps: one canonical payload per stable ID. */
export interface WorkspaceRecord {
  readonly recordId: string;
  readonly kind: "observation" | "artifact";
  /** Null only for shared published content. */
  readonly participantId: string | null;
  readonly payload: string;
}

export function codeRevision(
  participantId: string,
  sourceId: string,
  revision: number,
  code: string,
  mediaType: string = PYTHON_MEDIA_TYPE,
): CodeRevisionArtifact {
  const bounded = boundText(code);
  const artifactId = `${sourceId}.code.${revision}`;
  safeIdentifier(artifactId);
  return {
    schemaVersion: "1.0.0",
    type: "artifact.code-revision",
    artifactId,
    owner: "participant",
    participantId,
    revision,
    mediaType,
    text: bounded.text,
    capture: {
      captureVersion: WORKSPACE_CAPTURE_VERSION,
      limitBytes: CAPTURE_LIMIT_BYTES,
      originalBytes: bounded.originalBytes,
      capturedBytes: bounded.capturedBytes,
      truncated: bounded.truncated,
    },
  };
}

export function toRecord(
  value: WorkspaceObservation | CodeRevisionArtifact | { artifactId: string },
): WorkspaceRecord {
  const payload = canonical(value as unknown as Json);
  if ("observationId" in value)
    return {
      recordId: value.observationId,
      kind: "observation",
      participantId: value.participantId,
      payload,
    };
  const owner = (value as { participantId?: string }).participantId ?? null;
  return {
    recordId: value.artifactId,
    kind: "artifact",
    participantId: owner,
    payload,
  };
}

/**
 * Practice feedback derived from a stored run observation with the assessment 1.0.0
 * formula. It is recomputed on demand and never replaces the raw outcome.
 */
export function runFeedback(
  challenge: Challenge,
  cases: readonly { output?: { text: string; truncated: boolean } }[],
): { passed: boolean[]; correct: number; total: number; unscorable: number[] } {
  const unscorable: number[] = [];
  const outputs = challenge.expected.map((_, index): Json => {
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
  const passed = fixtureVerdicts(challenge, outputs).map(
    (verdict, index) => verdict && !unscorable.includes(index),
  );
  return {
    passed,
    correct: passed.filter(Boolean).length,
    total: passed.length,
    unscorable,
  };
}

/**
 * A pull request's result from its run outcome. Merged needs a completed test phase in which
 * every case passed; a compile or runtime error, timeout or runner failure means the checks
 * errored before reaching the cases.
 */
export function pullRequestResult(
  challenge: Challenge,
  outcome:
    | {
        status: string;
        phase?: string;
        cases?: readonly { output?: { text: string; truncated: boolean } }[];
      }
    | undefined,
): { result: PullRequestResult; passed: number; total: number } {
  const total = challenge.expected.length;
  if (!outcome || outcome.status === "cancelled")
    return { result: "cancelled", passed: 0, total };
  if (
    (outcome.status !== "completed" && outcome.status !== "user-error") ||
    outcome.phase !== "tests" ||
    !outcome.cases
  )
    return { result: "checks-errored", passed: 0, total };
  const { correct } = runFeedback(challenge, outcome.cases);
  return {
    result: correct === total && total > 0 ? "merged" : "checks-failed",
    passed: correct,
    total,
  };
}
