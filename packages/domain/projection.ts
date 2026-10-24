/**
 * Derived assessment projections over captured evidence. Each projection names the exact
 * evidence and evaluator/environment versions it used; reassessment appends a new one.
 */
import {
  assess,
  parseOutputs,
  type Attempt,
  type Challenge,
} from "./assessment";
import {
  attemptFrom,
  encodeRecord,
  type ContentArtifact,
  type SubmissionArtifact,
  type SubmissionObservation,
} from "./evidence";
import { safeIdentifier } from "./events";

export interface Version {
  readonly id: string;
  readonly version: string;
}

export interface Evaluator extends Version {
  /** Where the evaluator runs; part of what a later reproduction must match. */
  readonly environment: Version;
  supports(assessmentVersion: string): boolean;
  assess(challenge: Challenge, attempt: Attempt): object;
}

/** The existing provisional fixture comparison. Pure TypeScript; never executes submissions. */
export const fixtureEvaluator: Evaluator = {
  id: "fixture-json-compare",
  version: "1.0.0",
  environment: { id: "pure-typescript-no-execution", version: "1.0.0" },
  supports: (assessmentVersion) => assessmentVersion === "1.0.0",
  assess,
};

export type ProjectionOutcome =
  | { readonly status: "assessed"; readonly assessment: object }
  | { readonly status: "not-assessed-truncated" }
  | { readonly status: "parse-failed"; readonly message: string }
  | { readonly status: "unsupported"; readonly assessmentVersion: string }
  | { readonly status: "rejected"; readonly message: string };

export interface AssessmentProjection {
  readonly schemaVersion: "1.0.0";
  readonly type: "projection.assessment";
  readonly projectionId: string;
  readonly participantId: string;
  readonly observationIds: readonly string[];
  readonly artifactIds: readonly string[];
  readonly evaluator: Version;
  readonly environment: Version;
  readonly provisional: true;
  readonly outcome: ProjectionOutcome;
}

export interface Evidence {
  readonly observation: SubmissionObservation;
  readonly submission: SubmissionArtifact;
  readonly adventure: ContentArtifact;
  readonly challenge: ContentArtifact;
}

/**
 * Stable, bounded projection identity covering the full evaluator and environment
 * provenance, so changing either one appends a new projection instead of colliding.
 */
export async function projectionIdFor(
  observationId: string,
  evaluator: Version,
  environment: Version,
): Promise<string> {
  const provenance = encodeRecord({
    evaluator: { id: evaluator.id, version: evaluator.version },
    environment: { id: environment.id, version: environment.version },
  });
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(provenance)),
  );
  // 128 bits of SHA-256 keep the ID short; a collision would fail as a conflict, never overwrite.
  const hex = [...digest.subarray(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const projectionId = `${observationId}.assessment.${hex}`;
  safeIdentifier(projectionId);
  return projectionId;
}

/** Deterministic: the same evidence, evaluator and environment always give the same projection. */
export async function projectAssessment(
  evidence: Evidence,
  evaluator: Evaluator = fixtureEvaluator,
): Promise<AssessmentProjection> {
  const { observation, submission, adventure, challenge } = evidence;
  if (
    observation.submissionArtifactId !== submission.artifactId ||
    observation.adventureArtifactId !== adventure.artifactId ||
    observation.challengeArtifactId !== challenge.artifactId
  )
    throw new Error("Evidence does not belong to this observation.");
  const projectionId = await projectionIdFor(
    observation.observationId,
    evaluator,
    evaluator.environment,
  );
  return {
    schemaVersion: "1.0.0",
    type: "projection.assessment",
    projectionId,
    participantId: observation.participantId,
    observationIds: [observation.observationId],
    artifactIds: [
      adventure.artifactId,
      challenge.artifactId,
      submission.artifactId,
    ],
    evaluator: { id: evaluator.id, version: evaluator.version },
    environment: {
      id: evaluator.environment.id,
      version: evaluator.environment.version,
    },
    provisional: true,
    outcome: outcome(evidence, evaluator),
  };
}

function outcome(evidence: Evidence, evaluator: Evaluator): ProjectionOutcome {
  // Never score a prefix as if it were the whole submission.
  if (evidence.submission.capture.truncated)
    return { status: "not-assessed-truncated" };
  const content = evidence.challenge.content as Challenge;
  if (!evaluator.supports(content.assessment_version))
    return {
      status: "unsupported",
      assessmentVersion: content.assessment_version,
    };
  let outputs;
  try {
    outputs = parseOutputs(evidence.submission.text);
  } catch (error) {
    return { status: "parse-failed", message: (error as Error).message };
  }
  try {
    const attempt = attemptFrom(evidence.observation, content, outputs);
    return {
      status: "assessed",
      assessment: evaluator.assess(content, attempt),
    };
  } catch (error) {
    return { status: "rejected", message: (error as Error).message };
  }
}
