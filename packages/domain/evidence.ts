/**
 * Capture-first evidence primitives: exact-content artifacts and a submission observation.
 * Capture never parses or scores; derived results live in `projection.ts`.
 */
import {
  canonical,
  snapshot,
  type Adventure,
  type Attempt,
  type Challenge,
  type Encounter,
  type Json,
} from "./assessment";
import { assertEncounter, safeIdentifier } from "./events";

/** Declares what this capture records and its size boundary. A new boundary needs a new version. */
export const CAPTURE_VERSION = "synthetic-submission-capture-1.0.0";
export const CAPTURE_LIMIT_BYTES = 65536;
/** Activity this capture version does not record. Absence here is a gap, not evidence of no activity. */
export const CAPTURE_GAPS = [
  "workspace-edits",
  "code-revisions",
  "runs-and-execution-output",
  "active-time",
] as const;

/** Published Adventure or Challenge content, shared by every participant who saw it. */
export interface ContentArtifact {
  readonly schemaVersion: "1.0.0";
  readonly type: "artifact.content";
  readonly artifactId: string;
  readonly owner: "shared";
  readonly kind: "adventure" | "challenge";
  readonly contentId: string;
  readonly contentVersion: string;
  readonly content: Adventure | Challenge;
}

/** The exact submitted text within the declared bound. Owned by one participant, never shared. */
export interface SubmissionArtifact {
  readonly schemaVersion: "1.0.0";
  readonly type: "artifact.submission";
  readonly artifactId: string;
  readonly owner: "participant";
  readonly participantId: string;
  readonly mediaType: "text/plain; charset=utf-8";
  readonly text: string;
  readonly capture: {
    readonly captureVersion: string;
    readonly limitBytes: number;
    readonly originalBytes: number;
    readonly capturedBytes: number;
    readonly truncated: boolean;
  };
}

export type Artifact = ContentArtifact | SubmissionArtifact;

export interface SubmissionObservation {
  readonly schemaVersion: "1.0.0";
  readonly type: "observation.submission";
  readonly observationId: string;
  readonly participantId: string;
  readonly source: { readonly id: string; readonly sequence: number };
  /** Client clock at submission. */
  readonly occurredAt: string;
  /** No server receives this local example; the absence is explicit rather than a missing field. */
  readonly serverReceipt: {
    readonly status: "absent";
    readonly reason: "local-only";
  };
  readonly captureVersion: string;
  readonly captureGaps: readonly string[];
  readonly consentVersion: string;
  readonly researchConsent: false;
  readonly adventureArtifactId: string;
  readonly challengeArtifactId: string;
  readonly submissionArtifactId: string;
  readonly encounter: Encounter;
  readonly startedAt: string;
  readonly hintsShown: readonly number[];
  readonly assistance: Attempt["assistance"];
}

/** Everything one capture commits together, before any parsing or assessment. */
export interface CapturedSubmission {
  readonly artifacts: readonly ContentArtifact[];
  readonly submission: SubmissionArtifact;
  readonly observation: SubmissionObservation;
}

export interface SubmissionInput {
  readonly observationId: string;
  readonly participantId: string;
  readonly source: { readonly id: string; readonly sequence: number };
  readonly occurredAt: string;
  readonly startedAt: string;
  readonly consentVersion: string;
  readonly adventure: Adventure;
  readonly challenge: Challenge;
  readonly encounter: Encounter;
  readonly hintsShown: readonly number[];
  readonly assistance: Attempt["assistance"];
  /** Original text exactly as entered: no trimming, parsing or normalization. */
  readonly text: string;
}

export function contentArtifactId(
  kind: ContentArtifact["kind"],
  id: string,
  version: string,
): string {
  return `${kind}.${id}.${version}`;
}

export function contentArtifact(
  kind: ContentArtifact["kind"],
  content: Adventure | Challenge,
): ContentArtifact {
  return copy({
    schemaVersion: "1.0.0",
    type: "artifact.content",
    artifactId: contentArtifactId(kind, content.id, content.version),
    owner: "shared",
    kind,
    contentId: content.id,
    contentVersion: content.version,
    content,
  });
}

/**
 * Keeps at most `limitBytes` of UTF-8, cut at a character boundary so the result is
 * deterministic for the same input and limit. Untruncated text is kept as given.
 */
export function boundText(text: string, limitBytes = CAPTURE_LIMIT_BYTES) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= limitBytes)
    return {
      text,
      originalBytes: bytes.length,
      capturedBytes: bytes.length,
      truncated: false,
    };
  let end = limitBytes;
  // Step back over UTF-8 continuation bytes rather than split a character.
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return {
    text: new TextDecoder().decode(bytes.subarray(0, end)),
    originalBytes: bytes.length,
    capturedBytes: end,
    truncated: true,
  };
}

export function captureSubmission(input: SubmissionInput): CapturedSubmission {
  safeIdentifier(input.observationId);
  safeIdentifier(input.participantId);
  safeIdentifier(input.source.id);
  if (!Number.isSafeInteger(input.source.sequence) || input.source.sequence < 1)
    throw new Error("Source sequence must be a positive integer.");
  if (typeof input.text !== "string")
    throw new Error("Capture the submission as text.");
  if (!input.consentVersion) throw new Error("Consent is required.");
  if (
    !Number.isFinite(Date.parse(input.occurredAt)) ||
    !Number.isFinite(Date.parse(input.startedAt))
  )
    throw new Error("Capture times must be ISO timestamps.");
  assertEncounter(input.adventure, input.encounter);
  const ref = input.encounter.challengeOrder[input.encounter.position];
  if (
    !ref ||
    ref[0] !== input.challenge.id ||
    ref[1] !== input.challenge.version
  )
    throw new Error("Challenge order does not match.");

  const adventure = contentArtifact("adventure", input.adventure);
  const challenge = contentArtifact("challenge", input.challenge);
  const bounded = boundText(input.text);
  const submission: SubmissionArtifact = {
    schemaVersion: "1.0.0",
    type: "artifact.submission",
    artifactId: `${input.observationId}.submission`,
    owner: "participant",
    participantId: input.participantId,
    mediaType: "text/plain; charset=utf-8",
    text: bounded.text,
    capture: {
      captureVersion: CAPTURE_VERSION,
      limitBytes: CAPTURE_LIMIT_BYTES,
      originalBytes: bounded.originalBytes,
      capturedBytes: bounded.capturedBytes,
      truncated: bounded.truncated,
    },
  };
  const observation: SubmissionObservation = {
    schemaVersion: "1.0.0",
    type: "observation.submission",
    observationId: input.observationId,
    participantId: input.participantId,
    source: input.source,
    occurredAt: input.occurredAt,
    serverReceipt: { status: "absent", reason: "local-only" },
    captureVersion: CAPTURE_VERSION,
    captureGaps: bounded.truncated
      ? [...CAPTURE_GAPS, "submission-truncated"]
      : [...CAPTURE_GAPS],
    consentVersion: input.consentVersion,
    researchConsent: false,
    adventureArtifactId: adventure.artifactId,
    challengeArtifactId: challenge.artifactId,
    submissionArtifactId: submission.artifactId,
    encounter: input.encounter,
    startedAt: input.startedAt,
    hintsShown: input.hintsShown,
    assistance: input.assistance,
  };
  safeIdentifier(submission.artifactId);
  return copy({ artifacts: [adventure, challenge], submission, observation });
}

/**
 * Structural checks a store runs before committing a capture. Deliberately no parsing or
 * scoring: those failures belong in projections, not in deciding whether evidence survives.
 */
export function verifyCapture(captured: CapturedSubmission): void {
  const { artifacts, submission, observation } = captured;
  safeIdentifier(observation.observationId);
  safeIdentifier(observation.participantId);
  safeIdentifier(submission.artifactId);
  if (
    observation.schemaVersion !== "1.0.0" ||
    observation.type !== "observation.submission" ||
    submission.schemaVersion !== "1.0.0" ||
    submission.type !== "artifact.submission"
  )
    throw new Error("Unsupported evidence schema.");
  if (observation.researchConsent !== false)
    throw new Error("This local example never records research consent.");
  if (
    submission.owner !== "participant" ||
    submission.participantId !== observation.participantId ||
    observation.submissionArtifactId !== submission.artifactId
  )
    throw new Error("A submission belongs to its observation's participant.");
  const { capture } = submission;
  if (
    new TextEncoder().encode(submission.text).length !==
      capture.capturedBytes ||
    capture.capturedBytes > capture.limitBytes ||
    capture.capturedBytes > capture.originalBytes ||
    capture.truncated !== capture.capturedBytes < capture.originalBytes ||
    capture.truncated !==
      observation.captureGaps.includes("submission-truncated")
  )
    throw new Error("Submission capture bounds are inconsistent.");
  for (const artifact of artifacts) {
    if (
      artifact.type !== "artifact.content" ||
      artifact.owner !== "shared" ||
      artifact.artifactId !==
        contentArtifactId(
          artifact.kind,
          artifact.content.id,
          artifact.content.version,
        ) ||
      artifact.contentId !== artifact.content.id ||
      artifact.contentVersion !== artifact.content.version
    )
      throw new Error("Shared artifacts hold published content only.");
  }
  const ids = artifacts.map((artifact) => artifact.artifactId);
  if (
    !ids.includes(observation.adventureArtifactId) ||
    !ids.includes(observation.challengeArtifactId)
  )
    throw new Error("Observation must reference its pinned content artifacts.");
}

/** Attempt view of captured evidence, for evaluators that use the existing assessment contract. */
export function attemptFrom(
  observation: SubmissionObservation,
  challenge: Challenge,
  outputs: readonly Json[],
): Attempt {
  return {
    id: observation.observationId,
    participantId: observation.participantId,
    challengeId: challenge.id,
    challengeVersion: challenge.version,
    challengeSnapshot: snapshot(challenge),
    encounter: observation.encounter,
    outputs,
    assistance: observation.assistance,
    hintsShown: observation.hintsShown,
    startedAt: observation.startedAt,
    submittedAt: observation.occurredAt,
    activeSeconds: null,
    consentVersion: observation.consentVersion,
  };
}

export function encodeRecord(record: object): string {
  return canonical(record as unknown as Json);
}

/** Snapshot rather than retain references to caller-owned objects. */
function copy<T extends object>(value: T): T {
  return JSON.parse(encodeRecord(value));
}
