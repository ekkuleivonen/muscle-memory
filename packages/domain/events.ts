/** Legacy `attempt.assessed` envelope. Content snapshots make historical replay explicit. */
import {
  assess,
  canonical,
  snapshot,
  type Adventure,
  type Challenge,
  type Attempt,
  type Encounter,
  type Json,
} from "./assessment";

export interface AttemptEvent {
  readonly schemaVersion: "1.0.0";
  readonly type: "attempt.assessed";
  readonly eventId: string;
  readonly participantId: string;
  readonly occurredAt: string;
  readonly researchConsent: false;
  readonly adventureSnapshot: Adventure;
  readonly challengeSnapshot: Challenge;
  readonly attempt: Attempt;
  readonly assessment: ReturnType<typeof assess>;
}

export function safeIdentifier(value: string): void {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)
  ) {
    throw new Error(
      "Use an opaque safe identifier, not a name or email address.",
    );
  }
}

export function assertEncounter(
  adventure: Adventure,
  context: Encounter,
): void {
  if (
    context.adventureId !== adventure.id ||
    context.adventureVersion !== adventure.version ||
    context.presentation !== adventure.presentation ||
    canonical(context.challengeOrder as unknown as Json) !==
      canonical(adventure.challenges as unknown as Json)
  ) {
    throw new Error(
      "Encounter must preserve the exact Adventure version, presentation and order.",
    );
  }
}

/**
 * Legacy assessed snapshot: scoring runs before this envelope exists, so it is not raw
 * evidence. Capture-first submissions use `evidence.ts` and `projection.ts` instead.
 */
export function createAttemptEvent(
  adventure: Adventure,
  challenge: Challenge,
  attempt: Attempt,
): AttemptEvent {
  safeIdentifier(attempt.id);
  safeIdentifier(attempt.participantId);
  assertEncounter(adventure, attempt.encounter);
  if (attempt.challengeSnapshot !== snapshot(challenge))
    throw new Error("Challenge content does not match.");
  const event: AttemptEvent = {
    schemaVersion: "1.0.0",
    type: "attempt.assessed",
    eventId: attempt.id,
    participantId: attempt.participantId,
    occurredAt: attempt.submittedAt,
    researchConsent: false,
    adventureSnapshot: adventure,
    challengeSnapshot: challenge,
    attempt,
    assessment: assess(challenge, attempt),
  };
  // Snapshot rather than retain references to caller-owned objects.
  return JSON.parse(encodeEvent(event));
}

export function encodeEvent(event: AttemptEvent): string {
  return canonical(event as unknown as Json);
}
