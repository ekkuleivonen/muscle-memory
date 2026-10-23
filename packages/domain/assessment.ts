/** Pure assessment logic. It compares JSON data and never executes submitted code. */
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type Reference = readonly [id: string, version: string];
export interface Challenge {
  readonly id: string;
  readonly version: string;
  readonly assessment_version: string;
  readonly task: string;
  readonly skills: readonly string[];
  readonly hints: readonly string[];
  readonly inputs: readonly Json[];
  readonly expected: readonly Json[];
}
export interface Adventure {
  readonly id: string;
  readonly version: string;
  readonly story: string;
  readonly presentation: string;
  readonly challenges: readonly Reference[];
}
export interface Encounter {
  readonly adventureId: string;
  readonly adventureVersion: string;
  readonly challengeOrder: readonly Reference[];
  readonly position: number;
  readonly presentation: string;
  readonly cluesShown: readonly string[];
}
export interface Attempt {
  readonly id: string;
  readonly participantId: string;
  readonly challengeId: string;
  readonly challengeVersion: string;
  readonly challengeSnapshot: string;
  readonly encounter: Encounter;
  readonly outputs: readonly Json[];
  readonly assistance: "unaided" | "assisted" | "undisclosed";
  readonly hintsShown: readonly number[];
  readonly startedAt: string;
  readonly submittedAt: string;
  readonly activeSeconds: number | null;
  readonly consentVersion: string;
}

export function canonical(value: Json): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
        .join(",") +
      "}"
    );
  }
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("Numbers must be finite.");
  return JSON.stringify(value);
}
export function snapshot(challenge: Challenge): string {
  return canonical(challenge as unknown as Json);
}
export function encounter(adventure: Adventure, position = 0): Encounter {
  if (!Number.isInteger(position) || !adventure.challenges[position])
    throw new Error("Invalid Challenge position.");
  return {
    adventureId: adventure.id,
    adventureVersion: adventure.version,
    challengeOrder: adventure.challenges.map((ref) => [...ref] as Reference),
    position,
    presentation: adventure.presentation,
    cluesShown: [],
  };
}
export function parseOutputs(text: string): Json[] {
  if (new TextEncoder().encode(text).length > 65536)
    throw new Error("Keep answers below 64 KiB.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Enter a valid JSON array.");
  }
  if (!Array.isArray(value))
    throw new Error(
      "Enter one JSON array containing an output for each fixture.",
    );
  canonical(value);
  return value;
}
export function assess(challenge: Challenge, attempt: Attempt) {
  if (!attempt.consentVersion) throw new Error("Consent is required.");
  if (
    attempt.challengeId !== challenge.id ||
    attempt.challengeVersion !== challenge.version ||
    attempt.challengeSnapshot !== snapshot(challenge)
  )
    throw new Error("The Challenge changed. Start a new attempt.");
  const ref = attempt.encounter.challengeOrder[attempt.encounter.position];
  if (!ref || ref[0] !== challenge.id || ref[1] !== challenge.version)
    throw new Error("Challenge order does not match.");
  if (
    attempt.hintsShown.some(
      (index) => !Number.isInteger(index) || !challenge.hints[index],
    )
  )
    throw new Error("Unknown hint.");
  const elapsed =
    (Date.parse(attempt.submittedAt) - Date.parse(attempt.startedAt)) / 1000;
  if (
    !Number.isFinite(elapsed) ||
    elapsed < 0 ||
    (attempt.activeSeconds !== null &&
      (!Number.isFinite(attempt.activeSeconds) ||
        attempt.activeSeconds < 0 ||
        attempt.activeSeconds > elapsed))
  )
    throw new Error("Invalid attempt time.");
  if (
    !challenge.expected.length ||
    attempt.outputs.length !== challenge.expected.length
  )
    throw new Error("Submit exactly one output per fixture.");
  const passed = attempt.outputs.map(
    (value, index) => canonical(value) === canonical(challenge.expected[index]),
  );
  return {
    schemaVersion: "1.0.0",
    assessmentVersion: challenge.assessment_version,
    attemptId: attempt.id,
    passed,
    correctness: passed.filter(Boolean).length / passed.length,
    provisional: true as const,
    feedback: `${passed.filter(Boolean).length}/${passed.length} fixtures correct. Review the cases below and try again. This is practice feedback, not a skill ranking.`,
  };
}
