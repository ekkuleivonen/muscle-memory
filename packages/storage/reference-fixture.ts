/** Synthetic acceptance fixture shared by the local CLI and persistence tests. */
import adventureData from "../../content/adventures/field-notes.v1.json";
import challengeData from "../../content/challenges/frequency-map.v1.json";
import {
  encounter,
  snapshot,
  type Adventure,
  type Challenge,
  type Attempt,
} from "../domain/assessment";
import { createAttemptEvent } from "../domain/events";

export function referenceEvent(
  participantId = "synthetic-participant-1",
  attemptId = "synthetic-field-notes-1",
) {
  const adventure: Adventure = {
    ...adventureData,
    challenges: adventureData.challenges.map(([id, version]) => [id, version]),
  };
  const challenge = challengeData as unknown as Challenge;
  const attempt: Attempt = {
    id: attemptId,
    participantId,
    challengeId: challenge.id,
    challengeVersion: challenge.version,
    challengeSnapshot: snapshot(challenge),
    encounter: encounter(adventure),
    outputs: challenge.expected,
    assistance: "unaided",
    hintsShown: [],
    startedAt: "2026-01-01T00:00:00Z",
    submittedAt: "2026-01-01T00:01:00Z",
    activeSeconds: null,
    consentVersion: "synthetic-demo-v1",
  };
  return createAttemptEvent(adventure, challenge, attempt);
}
