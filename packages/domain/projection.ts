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

/** Deterministic: the same evidence and evaluator version always give the same projection. */
export function projectAssessment(
  evidence: Evidence,
  evaluator: Evaluator = fixtureEvaluator,
): AssessmentProjection {
  const { observation, submission, adventure, challenge } = evidence;
  if (
    observation.submissionArtifactId !== submission.artifactId ||
    observation.adventureArtifactId !== adventure.artifactId ||
    observation.challengeArtifactId !== challenge.artifactId
  )
    throw new Error("Evidence does not belong to this observation.");
  const projectionId = `${observation.observationId}.assessment.${evaluator.id}.${evaluator.version}`;
  safeIdentifier(projectionId);
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
    environment: evaluator.environment,
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
