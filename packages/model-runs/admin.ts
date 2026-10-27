/**
 * What the admin's model runner agrees on with the server: which models and conditions are
 * well formed, what a condition asks of a request, and what a finished run's records must be
 * before they are stored. Pure, so the browser and the Worker share it.
 */
import type { Json } from "../domain/json";
import { modelParticipant } from "../domain/model";
import type { Assignments, StoredRecord } from "../domain/records";
import type { Claimed } from "./ledger";

/** An OpenRouter model id, such as anthropic/claude-opus-5.5 or a/b:free. */
export const MODEL_ID = /^~?[a-z0-9][a-z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*(?::[a-z0-9-]+)?$/;

/** Tries per target and live revision: each runs this many times, never more. */
export const TRIES = 3;

/** Reasoning efforts as OpenRouter names them, and `default` for leaving it to the model. */
export const EFFORTS = ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

/** A run's condition: its experiment arms. Today one, the reasoning effort. */
export function conditionFrom(value: unknown): Assignments {
  const effort = (value as { reasoning?: unknown } | null)?.reasoning;
  if (!EFFORTS.includes(effort as Effort)) throw new Error("A condition names a reasoning effort.");
  return { reasoning: effort as Effort };
}

/**
 * The fixed request parameters for a condition and a model: the reasoning effort unless it is
 * the model's default, and log probabilities wherever the model's listing supports them (only
 * from providers that return them).
 */
export function requestFor(
  condition: Assignments,
  supportedParameters: readonly string[],
): Record<string, Json> {
  const effort = condition.reasoning ?? "default";
  return {
    ...(effort !== "default" ? { reasoning: { effort } } : {}),
    ...(supportedParameters.includes("logprobs")
      ? { logprobs: true, top_logprobs: 20, provider: { require_parameters: true } }
      : {}),
  };
}

/**
 * Checks a finished run's records against the slot it claimed: every one is the model's, from
 * this run's session, about this revision, with ids that are safe and unique. Anything else is
 * refused whole.
 */
export function checkRunRecords(records: unknown, slot: Claimed): StoredRecord[] {
  if (!Array.isArray(records) || !records.length) throw new Error("A run has records.");
  const participant = modelParticipant(slot.model);
  const seen = new Set<string>();
  for (const record of records as StoredRecord[]) {
    if (
      !record ||
      typeof record.recordId !== "string" ||
      typeof record.payload !== "string" ||
      (record.kind !== "observation" && record.kind !== "artifact") ||
      record.participantId !== participant ||
      seen.has(record.recordId)
    )
      throw new Error("A record is malformed, repeated or another participant's.");
    seen.add(record.recordId);
    const value = JSON.parse(record.payload) as Record<string, unknown>;
    if (value.participantId !== participant) throw new Error("A payload names another participant.");
    if (record.kind === "artifact") {
      if (value.artifactId !== record.recordId) throw new Error("An artifact's id does not match.");
      continue;
    }
    if (
      value.observationId !== record.recordId ||
      value.actor !== "model" ||
      value.termsVersion !== null ||
      value.sessionId !== `run-${slot.runId}` ||
      value.challenge !== slot.challengeKey ||
      value.challengeRevision !== slot.revision
    )
      throw new Error(`${record.recordId} is not this run's.`);
  }
  return records as StoredRecord[];
}
